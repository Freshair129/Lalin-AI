from pathlib import Path
import sys
import types

import pytest


def test_frozen_demucs_requires_external_python(monkeypatch, tmp_path):
    from app.pipelines import music
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.delenv("GMUSIC_DEMUCS_PYTHON", raising=False)
    with pytest.raises(RuntimeError, match="GMUSIC_DEMUCS_PYTHON"):
        music.separate_stems("vocal.wav", str(tmp_path), device="cpu")


def test_frozen_demucs_uses_external_python(monkeypatch, tmp_path):
    from app.pipelines import music
    python = tmp_path / "python.exe"
    python.touch()
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setenv("GMUSIC_DEMUCS_PYTHON", str(python))
    commands = []
    monkeypatch.setattr(music.subprocess, "run", lambda command, **kw: commands.append(command))
    result = music.separate_stems("vocal.wav", str(tmp_path), device="auto")
    assert commands[0][:2] == [str(python), "-c"]
    assert "SetDllDirectoryW(None)" in commands[0][2]
    assert "run_module('demucs'" in commands[0][2]
    assert commands[0][commands[0].index("-d") + 1] == "cpu"
    assert Path(result["vocals"]).name == "vocals.wav"


def test_frozen_cuda_demucs_uses_gpu_queue(monkeypatch):
    from app.routers import music
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(music, "get_settings", lambda: types.SimpleNamespace(tts_device="cuda"), raising=False)
    assert music.remix_resource() == "gpu"


@pytest.mark.parametrize("kind", ["remix", "music-remix-preview"])
def test_frozen_cuda_remix_admission_uses_external_vram(monkeypatch, kind):
    from app.jobs import resources
    from app.jobs.manager import Job
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr("app.config.get_settings", lambda: types.SimpleNamespace(gpu_min_free_mb={"remix": 2048}))
    monkeypatch.setattr(resources, "external_remix_free_vram", lambda: 1024 * 1024 * 1024, raising=False)
    job = Job(id="j", kind=kind, resource="gpu")
    assert not resources.configured_gpu_probe(job)
    monkeypatch.setattr(resources, "external_remix_free_vram", lambda: 3 * 1024 * 1024 * 1024, raising=False)
    assert resources.configured_gpu_probe(job)
    monkeypatch.setattr(resources, "external_remix_free_vram", lambda: None, raising=False)
    with pytest.raises(resources.GpuAdmissionError):
        resources.configured_gpu_probe(job)


def test_permanent_gpu_probe_error_finishes_job_and_releases_queue():
    import asyncio
    from app.jobs.manager import JobManager
    from app.jobs.resources import GpuAdmissionError

    async def scenario():
        def probe(job):
            if job.kind == "broken":
                raise GpuAdmissionError("runtime unavailable")
            return True
        manager = JobManager(gpu_probe=probe)
        async def task(_job, _report):
            return {}
        broken = manager.create("broken", resource="gpu")
        following = manager.create("following", resource="gpu")
        await asyncio.wait_for(asyncio.gather(manager.run(broken, task), manager.run(following, task)), 2)
        return broken, following

    broken, following = asyncio.run(scenario())
    assert broken.status == "error" and "runtime unavailable" in broken.error
    assert following.status == "done"


def test_external_gpu_probe_handles_bad_runtime_and_cuda(monkeypatch, tmp_path):
    from app.jobs import resources
    monkeypatch.delenv("GMUSIC_DEMUCS_PYTHON", raising=False)
    assert resources.external_remix_free_vram() is None
    python = tmp_path / "python.exe"
    python.touch()
    monkeypatch.setenv("GMUSIC_DEMUCS_PYTHON", str(python))
    monkeypatch.setattr(resources.subprocess, "run", lambda *args, **kwargs: types.SimpleNamespace(stdout="-1"))
    assert resources.external_remix_free_vram() is None
    def unusable(*args, **kwargs):
        raise OSError("interpreter cannot start")
    monkeypatch.setattr(resources.subprocess, "run", unusable)
    assert resources.external_remix_free_vram() is None
