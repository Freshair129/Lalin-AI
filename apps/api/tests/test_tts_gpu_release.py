"""Opt-in TTS model release receipts; all engine and CUDA behavior is faked."""
from __future__ import annotations

import time
from pathlib import Path


def _wait_for_job(client, job_id: str) -> dict:
    for _ in range(200):
        response = client.get(f"/jobs/{job_id}")
        assert response.status_code == 200
        job = response.json()
        if job["status"] in {"done", "error", "interrupted"}:
            return job
        time.sleep(0.01)
    raise AssertionError(f"job {job_id} did not reach a terminal state")


def _prepare_tts(monkeypatch, settings, *, device: str = "cuda"):
    from app.pipelines import tts
    from app.routers import tts as tts_router

    monkeypatch.setattr(settings, "tts_device", device)
    monkeypatch.setattr(settings, "tts_engine", "f5")
    monkeypatch.setattr(tts_router.voices, "resolve_ref", lambda _voice_id: ("ref.wav", "ref"))
    monkeypatch.setattr(tts, "_f5", None)
    monkeypatch.setattr(tts, "_xtts", None)
    return tts


def test_tts_release_gpu_model_returns_verified_receipt_and_downloadable_audio(
    client, monkeypatch, data_dir
):
    from app.config import get_settings

    settings = get_settings()
    tts = _prepare_tts(monkeypatch, settings)
    events: list[str] = []
    monkeypatch.setattr(tts, "cuda_memory_allocated", lambda: events.append("baseline") or 64)

    def synthesize(_text, out_path, **_kwargs):
        events.append("synthesize")
        Path(out_path).write_bytes(b"fake wav")
        tts._f5 = object()
        return out_path

    def release(engine, identity, baseline):
        events.append("release")
        assert engine == "f5"
        assert identity == id(tts._f5)
        assert baseline == 64
        tts._f5 = None
        return {"status": "released", "reason": None}

    monkeypatch.setattr(tts, "synthesize", synthesize)
    monkeypatch.setattr(tts, "release_cached_model", release)

    accepted = client.post(
        "/tts",
        json={"text": "ทดสอบ", "voice_id": "voice-1", "release_gpu_model": True},
    )
    assert accepted.status_code == 200
    assert set(accepted.json()) == {"job_id"}

    job = _wait_for_job(client, accepted.json()["job_id"])
    assert job["status"] == "done"
    assert job["result"]["output"] == str(data_dir / "outputs" / Path(job["result"]["output"]).name)
    assert job["result"]["gpu_release"] == {
        "requested": True,
        "model": "f5",
        "status": "released",
        "reason": None,
    }
    assert events == ["baseline", "synthesize", "release"]
    assert tts._f5 is None

    downloaded = client.get(f"/files/download/{Path(job['result']['output']).name}")
    assert downloaded.status_code == 200
    assert downloaded.content == b"fake wav"


def test_tts_release_never_evicts_a_model_cached_before_the_job(client, monkeypatch):
    from app.config import get_settings
    from app.pipelines import tts

    tts = _prepare_tts(monkeypatch, get_settings())
    retained_model = object()
    monkeypatch.setattr(tts, "_f5", retained_model)

    def forbidden(*_args, **_kwargs):
        raise AssertionError("preexisting cache must not be released")

    monkeypatch.setattr(tts, "cuda_memory_allocated", forbidden)
    monkeypatch.setattr(tts, "release_cached_model", forbidden)
    monkeypatch.setattr(tts, "synthesize", lambda *_args, **_kwargs: "unused")

    accepted = client.post(
        "/tts",
        json={"text": "ทดสอบ", "voice_id": "voice-1", "release_gpu_model": True},
    )
    job = _wait_for_job(client, accepted.json()["job_id"])

    assert job["status"] == "done"
    assert job["result"]["gpu_release"] == {
        "requested": True,
        "model": "f5",
        "status": "preexisting_model_retained",
        "reason": "model_cached_before_job",
    }
    assert tts._f5 is retained_model


def test_tts_error_still_exposes_release_receipt_before_terminal_state(client, monkeypatch):
    from app.config import get_settings
    from app.pipelines import tts

    tts = _prepare_tts(monkeypatch, get_settings())
    monkeypatch.setattr(tts, "cuda_memory_allocated", lambda: 32)

    def fail_after_load(*_args, **_kwargs):
        tts._f5 = object()
        raise RuntimeError("fake synthesis failure")

    def release(_engine, _identity, _baseline):
        tts._f5 = None
        return {"status": "released", "reason": None}

    monkeypatch.setattr(tts, "synthesize", fail_after_load)
    monkeypatch.setattr(tts, "release_cached_model", release)

    accepted = client.post(
        "/tts",
        json={"text": "ทดสอบ", "voice_id": "voice-1", "release_gpu_model": True},
    )
    job = _wait_for_job(client, accepted.json()["job_id"])

    assert job["status"] == "error"
    assert job["error"] == "fake synthesis failure"
    assert job["result"] == {
        "output": None,
        "gpu_release": {
            "requested": True,
            "model": "f5",
            "status": "released",
            "reason": None,
        },
    }


def test_failed_model_initialization_reports_unknown_when_allocations_remain(
    client, monkeypatch
):
    from app.config import get_settings
    from app.pipelines import tts

    tts = _prepare_tts(monkeypatch, get_settings())
    monkeypatch.setattr(tts, "cuda_memory_allocated", lambda: 32)

    def fail_before_model_cache(*_args, **_kwargs):
        raise RuntimeError("fake initialization failure")

    monkeypatch.setattr(tts, "synthesize", fail_before_model_cache)
    monkeypatch.setattr(tts, "verify_no_model_loaded_by_job", lambda *_args, **_kwargs: {
        "status": "unknown", "reason": "cuda_allocations_above_baseline"
    })

    accepted = client.post(
        "/tts",
        json={"text": "ทดสอบ", "voice_id": "voice-1", "release_gpu_model": True},
    )
    job = _wait_for_job(client, accepted.json()["job_id"])

    assert job["status"] == "error"
    assert job["result"]["gpu_release"] == {
        "requested": True,
        "model": "f5",
        "status": "unknown",
        "reason": "cuda_allocations_above_baseline",
    }


def test_cpu_tts_request_does_not_attempt_gpu_model_release(client, monkeypatch):
    from app.config import get_settings
    from app.pipelines import tts

    tts = _prepare_tts(monkeypatch, get_settings(), device="cpu")
    retained_model = object()
    monkeypatch.setattr(tts, "_f5", retained_model)

    def forbidden(*_args, **_kwargs):
        raise AssertionError("CPU TTS must not enter CUDA release helpers")

    monkeypatch.setattr(tts, "cuda_memory_allocated", forbidden)
    monkeypatch.setattr(tts, "release_cached_model", forbidden)
    monkeypatch.setattr(tts, "synthesize", lambda *_args, **_kwargs: "unused")

    accepted = client.post(
        "/tts",
        json={"text": "ทดสอบ", "voice_id": "voice-1", "release_gpu_model": True},
    )
    job = _wait_for_job(client, accepted.json()["job_id"])

    assert job["status"] == "done"
    assert job["result"]["gpu_release"]["status"] == "not_applicable"
    assert job["result"]["gpu_release"]["reason"] == "tts_device_is_cpu"
    assert tts._f5 is retained_model


def test_release_cached_model_drops_only_selected_singleton_and_verifies_cuda(monkeypatch):
    from app.pipelines import tts

    class FakeCuda:
        def __init__(self):
            self.allocated = 128
            self.events: list[str] = []

        def is_available(self):
            return True

        def synchronize(self):
            self.events.append("sync")

        def empty_cache(self):
            self.events.append("empty_cache")

        def memory_allocated(self):
            self.events.append("memory_allocated")
            return self.allocated

    class FakeTorch:
        def __init__(self):
            self.cuda = FakeCuda()

    monkeypatch.setattr(tts, "_f5", object())
    retained_xtts = object()
    monkeypatch.setattr(tts, "_xtts", retained_xtts)
    identity = tts.cached_model_identity("f5")
    torch = FakeTorch()

    def collect():
        torch.cuda.events.append("collect")
        torch.cuda.allocated = 100

    receipt = tts.release_cached_model(
        "f5", identity, 100, torch_module=torch, collect=collect
    )

    assert receipt == {"status": "released", "reason": None}
    assert tts._f5 is None
    assert tts._xtts is retained_xtts
    assert torch.cuda.events == [
        "sync", "collect", "empty_cache", "sync", "memory_allocated"
    ]


def test_release_cached_model_reports_unknown_when_cuda_memory_stays_above_baseline(
    monkeypatch,
):
    from app.pipelines import tts

    class FakeCuda:
        def is_available(self):
            return True

        def synchronize(self):
            pass

        def empty_cache(self):
            pass

        def memory_allocated(self):
            return 100 + tts.CUDA_RELEASE_RESIDUAL_TOLERANCE_BYTES + 1

    class FakeTorch:
        cuda = FakeCuda()

    monkeypatch.setattr(tts, "_xtts", object())
    identity = tts.cached_model_identity("xtts")
    receipt = tts.release_cached_model(
        "xtts", identity, 100, torch_module=FakeTorch(), collect=lambda: None
    )

    assert receipt == {
        "status": "unknown",
        "reason": "cuda_allocations_above_baseline",
    }
    assert tts._xtts is None


def test_release_cached_model_accepts_small_cuda_runtime_residual(monkeypatch):
    from app.pipelines import tts

    class FakeCuda:
        def is_available(self):
            return True

        def synchronize(self):
            pass

        def empty_cache(self):
            pass

        def memory_allocated(self):
            return 100 + 64 * 1024 * 1024

    class FakeTorch:
        cuda = FakeCuda()

    monkeypatch.setattr(tts, "_f5", object())
    identity = tts.cached_model_identity("f5")
    receipt = tts.release_cached_model(
        "f5", identity, 100, torch_module=FakeTorch(), collect=lambda: None
    )

    assert receipt == {
        "status": "released",
        "reason": "cuda_runtime_residual_within_tolerance",
    }
    assert tts._f5 is None


def test_release_cached_model_drops_owned_singleton_even_if_cuda_is_unavailable(
    monkeypatch,
):
    from app.pipelines import tts

    class FakeCuda:
        def is_available(self):
            return False

    class FakeTorch:
        cuda = FakeCuda()

    monkeypatch.setattr(tts, "_f5", object())
    identity = tts.cached_model_identity("f5")
    collected: list[bool] = []
    receipt = tts.release_cached_model(
        "f5", identity, 0, torch_module=FakeTorch(),
        collect=lambda: collected.append(True),
    )

    assert receipt == {"status": "unknown", "reason": "cuda_runtime_unavailable"}
    assert collected == [True]
    assert tts._f5 is None


def test_no_model_loaded_requires_cuda_cleanup_and_baseline_verification(monkeypatch):
    from app.pipelines import tts

    class FakeCuda:
        def __init__(self, allocated):
            self.allocated = allocated
            self.events: list[str] = []

        def is_available(self):
            return True

        def synchronize(self):
            self.events.append("sync")

        def empty_cache(self):
            self.events.append("empty_cache")

        def memory_allocated(self):
            self.events.append("memory_allocated")
            return self.allocated

    class FakeTorch:
        def __init__(self, allocated):
            self.cuda = FakeCuda(allocated)

    monkeypatch.setattr(tts, "_f5", None)
    torch = FakeTorch(100)

    def collect():
        torch.cuda.events.append("collect")

    receipt = tts.verify_no_model_loaded_by_job(
        "f5", 100, torch_module=torch, collect=collect
    )

    assert receipt == {
        "status": "not_applicable",
        "reason": "model_not_loaded_by_job",
    }
    assert torch.cuda.events == [
        "sync", "collect", "empty_cache", "sync", "memory_allocated"
    ]

    torch.cuda.allocated = 100 + tts.CUDA_RELEASE_RESIDUAL_TOLERANCE_BYTES + 1
    receipt = tts.verify_no_model_loaded_by_job(
        "f5", 100, torch_module=torch, collect=collect
    )
    assert receipt == {
        "status": "unknown",
        "reason": "cuda_allocations_above_baseline",
    }


def test_job_manager_persists_structured_result_on_task_failure():
    import asyncio

    from app.jobs.manager import JobManager, JobTaskError

    async def scenario():
        manager = JobManager(gpu_cleanup=lambda: None)
        job = manager.create("tts", resource="gpu")

        async def task(_job, _report):
            raise JobTaskError(
                "synthesis failed",
                {"output": None, "gpu_release": {"status": "released"}},
            )

        await manager.run(job, task)
        return job

    job = asyncio.run(scenario())
    assert job.status == "error"
    assert job.result == {"output": None, "gpu_release": {"status": "released"}}


def test_terminal_job_state_waits_for_release_receipt(tmp_path):
    import asyncio
    import json

    from app.jobs.manager import JobManager, is_terminal_status

    async def scenario():
        storage_path = tmp_path / "jobs.json"
        manager = JobManager(storage_path, gpu_cleanup=lambda: None)
        job = manager.create("tts", resource="gpu")
        events = manager.subscribe(job.id)
        release_started = asyncio.Event()
        finish_release = asyncio.Event()
        receipt = {
            "requested": True,
            "model": "f5",
            "status": "released",
            "reason": None,
        }

        async def task(_job, _report):
            release_started.set()
            await finish_release.wait()
            return {"output": "out.wav", "gpu_release": receipt}

        run_task = asyncio.create_task(manager.run(job, task))
        await asyncio.wait_for(release_started.wait(), timeout=1)

        assert job.status == "running"
        persisted = json.loads(storage_path.read_text(encoding="utf-8"))
        assert persisted["jobs"][0]["status"] == "running"
        observed = []
        while not events.empty():
            observed.append(events.get_nowait())
        assert all(not is_terminal_status(event["status"]) for event in observed)

        finish_release.set()
        await run_task

        terminal_event = events.get_nowait()
        assert terminal_event["status"] == "done"
        assert terminal_event["result"]["gpu_release"] == receipt
        persisted = json.loads(storage_path.read_text(encoding="utf-8"))
        assert persisted["jobs"][0]["status"] == "done"
        assert persisted["jobs"][0]["result"]["gpu_release"] == receipt

    asyncio.run(scenario())
