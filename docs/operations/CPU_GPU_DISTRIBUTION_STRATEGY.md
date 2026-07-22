# CPU/GPU Distribution Strategy

Date: 2026-07-03

## Decision

G-Music has two runtime lanes:

- Lite installer lane: CPU-safe desktop shell with the lite sidecar. It must boot without CUDA, model weights, or ML-heavy routers.
- Full workstation lane: Python 3.11 venv with ML modules and model caches. It may use CUDA when the local runtime is compatible, but speech features must have an explicit CPU fallback.

## Current Workstation Evidence

`apps\api\runtime_device_report.py` reports this workstation state:

- Python: `3.11.15`
- ASR config default: `cuda`, `float16`
- TTS config default: `cuda`
- Torch: `2.5.1+cu121`
- CUDA available: `true`
- GPU: `NVIDIA GeForce RTX 3060`
- CTranslate2: `4.8.0`, CUDA device count `1`

The machine has a GPU-capable runtime, but Sprint 9 exposed a speech CUDA failure:

```text
Could not load symbol cudnnGetLibConfig. Error code 127
```

For deterministic workstation smoke and fallback mode, speech smokes use:

```powershell
$env:ASR_DEVICE = "cpu"
$env:ASR_COMPUTE_TYPE = "int8"
$env:TTS_DEVICE = "cpu"
```

## Policy

- Keep production defaults as CUDA for workstation users who have a compatible GPU runtime.
- Provide a CPU fallback path for ASR/TTS so users are not blocked by cuDNN/CUDA DLL mismatches.
- Treat remix/Demucs GPU usage separately from speech GPU usage because they exercise different runtime stacks.
- Do not claim packaged full-workstation production readiness until the installable workstation artifact exposes this choice and records the selected runtime mode.

## Validation Command

Run from `apps\api\`:

```powershell
..\..\backend\.venv\Scripts\python.exe runtime_device_report.py
```

The command must exit nonzero if required runtime modules are missing.
