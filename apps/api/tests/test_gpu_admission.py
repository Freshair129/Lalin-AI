"""G-07 — GPU jobs are admitted one at a time without blocking CPU jobs."""
from __future__ import annotations

import asyncio


def test_gpu_jobs_run_fifo_with_single_concurrency():
    from app.jobs.manager import JobManager

    async def scenario():
        manager = JobManager()
        active = 0
        maximum = 0
        starts: list[str] = []

        def make_task(name: str):
            async def task(_job, _report):
                nonlocal active, maximum
                starts.append(name)
                active += 1
                maximum = max(maximum, active)
                await asyncio.sleep(0.01)
                active -= 1
                return {"name": name}
            return task

        jobs = [manager.create(name, resource="gpu") for name in ("one", "two", "three")]
        await asyncio.gather(*(manager.run(job, make_task(job.kind)) for job in jobs))
        return starts, maximum

    starts, maximum = asyncio.run(scenario())

    assert starts == ["one", "two", "three"]
    assert maximum == 1


def test_gpu_job_waits_for_free_vram_before_task_starts():
    from app.jobs.manager import JobManager

    probes = iter([False, False, True])
    started = False

    async def scenario():
        nonlocal started
        manager = JobManager(gpu_probe=lambda _job: next(probes), gpu_poll_seconds=0)
        job = manager.create("tts", resource="gpu")

        async def task(_job, _report):
            nonlocal started
            started = True
            return {}

        await manager.run(job, task)
        return job

    job = asyncio.run(scenario())

    assert started is True
    assert job.status == "done"


def test_gpu_cleanup_runs_after_success_and_error():
    from app.jobs.manager import JobManager

    cleaned: list[str] = []

    async def scenario():
        manager = JobManager(gpu_cleanup=lambda: cleaned.append("clean"))

        async def succeeds(_job, _report):
            return {}

        async def fails(_job, _report):
            raise RuntimeError("boom")

        first = manager.create("tts", resource="gpu")
        second = manager.create("remix", resource="gpu")
        await manager.run(first, succeeds)
        await manager.run(second, fails)
        return first, second

    first, second = asyncio.run(scenario())

    assert first.status == "done"
    assert second.status == "error"
    assert cleaned == ["clean", "clean"]


def test_cpu_job_is_not_blocked_by_running_gpu_job():
    from app.jobs.manager import JobManager

    async def scenario():
        manager = JobManager()
        gpu_started = asyncio.Event()
        release_gpu = asyncio.Event()
        cpu_finished = asyncio.Event()

        async def gpu_task(_job, _report):
            gpu_started.set()
            await release_gpu.wait()
            return {}

        async def cpu_task(_job, _report):
            cpu_finished.set()
            return {}

        gpu_job = manager.create("tts", resource="gpu")
        cpu_job = manager.create("render", resource="cpu")
        running_gpu = asyncio.create_task(manager.run(gpu_job, gpu_task))
        await gpu_started.wait()
        await asyncio.wait_for(manager.run(cpu_job, cpu_task), timeout=0.2)
        release_gpu.set()
        await running_gpu
        return cpu_finished.is_set()

    assert asyncio.run(scenario()) is True


def test_cpu_fallback_is_classified_as_cpu_without_gpu_admission():
    from app.jobs.resources import resource_for_device
    from app.runtime_devices import DeviceResolution

    resolution = DeviceResolution(
        requested="auto", effective="cpu", fallback=True, reason="cuda_unavailable"
    )

    assert resource_for_device(resolution) == "cpu"


def test_vram_probe_enforces_the_configured_threshold():
    from app.jobs.manager import Job
    from app.jobs.resources import has_required_vram

    job = Job(id="j", kind="tts", resource="gpu")
    mib = 1024 * 1024

    assert has_required_vram(
        job,
        minimum_mb={"tts": 2048},
        mem_get_info=lambda: (1024 * mib, 12 * 1024 * mib),
    ) is False
    assert has_required_vram(
        job,
        minimum_mb={"tts": 2048},
        mem_get_info=lambda: (3072 * mib, 12 * 1024 * mib),
    ) is True


def test_explicit_cuda_is_queued_before_pipeline_reports_unavailable_device():
    from app.jobs.resources import resource_for_requested_device

    def must_not_resolve_early():
        raise AssertionError("explicit CUDA must fail inside the persisted job")

    assert resource_for_requested_device("cuda", resolve_auto=must_not_resolve_early) == "gpu"
