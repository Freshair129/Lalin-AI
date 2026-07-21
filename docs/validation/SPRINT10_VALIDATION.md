# Sprint 10 Validation: CPU/GPU Runtime Strategy Gate

Date: 2026-07-03

## Scope

Sprint 10 closes the CPU/GPU strategy ambiguity for the current workstation track.

- Add a runtime report that inspects configured ASR/TTS devices, Torch CUDA, CTranslate2 CUDA, and required ML modules.
- Document the distribution policy: lite installer remains CPU-safe; full workstation can prefer CUDA but must expose CPU fallback for speech features.
- Preserve packaged/full workstation artifact and first-run UX as remaining gates.

## Acceptance Criteria

| Gate | Evidence | Result |
|---|---|---|
| Runtime report exists | `backend\runtime_device_report.py` | PASS |
| Required modules available | Report returned `missing_modules: []` | PASS |
| GPU evidence captured | Report showed `cuda_available: true`, GPU `NVIDIA GeForce RTX 3060`, CTranslate2 CUDA device count `1` | PASS |
| Config/runtime consistency | Report returned `runtime_errors: []`; it fails when configured CUDA devices are unavailable | PASS |
| Speech fallback policy documented | `docs\CPU_GPU_DISTRIBUTION_STRATEGY.md` records CPU fallback env for ASR/TTS | PASS |
| Production defaults preserved | `backend\app\config.py` remains CUDA/default; smoke fallback is opt-in per process | PASS |

## Validation Evidence

Command:

```powershell
cd backend
.\.venv\Scripts\python.exe runtime_device_report.py
```

Summary:

```text
settings.asr_device: cuda
settings.asr_compute_type: float16
settings.tts_device: cuda
python: 3.11.15
torch.version: 2.5.1+cu121
torch.cuda_available: true
torch.device_name: NVIDIA GeForce RTX 3060
ctranslate2.version: 4.8.0
ctranslate2.cuda_device_count: 1
missing_modules: []
runtime_errors: []
speech_fallback: ASR_DEVICE=cpu ASR_COMPUTE_TYPE=int8 TTS_DEVICE=cpu
```

## Remaining Production Gates

- Build or define the installable/launchable workstation artifact outside ad hoc developer commands.
- Run packaged/full-workstation feature smoke from that artifact.
- Finalize first-run model download UX/progress.
