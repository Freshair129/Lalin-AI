# RCA: Dubbing smoke failed while loading CUDA speech runtime

## Symptom

`backend\smoke_dubbing.py` started the dubbing pipeline but exited before producing an output file. The repeated error was:

```text
Could not load symbol cudnnGetLibConfig. Error code 127
```

## Evidence

- The first attempt reached `run_dubbing(...)` and failed after `faster-whisper-large-v3` cache initialization warnings.
- After forcing ASR to CPU/int8, the next attempt reached the TTS segment synthesis step and failed with the same cuDNN symbol error.
- Later full workstation harness attempts ran standalone `backend\smoke_tts.py` and exited with Windows status `-1073741819` after model loading began, including after setting `TTS_DEVICE=cpu`.
- `backend\app\config.py` defaults ASR to `asr_device="cuda"` and `asr_compute_type="float16"`.
- `backend\app\config.py` also defaults TTS to `tts_device="cuda"`.
- The standalone TTS and remix workstation smokes had already passed on this machine, so the issue appears when the end-to-end dubbing process exercises multiple speech runtime paths in sequence.

## Root Cause

The local CUDA speech runtime attempted to load a cuDNN symbol that is not available in the current Windows GPU library set. This made the dubbing smoke fail before the pipeline could complete.

## Why The Issue Escaped Detection

Previous gates did not execute ASR inside the dubbing flow. Standalone TTS and remix smokes exercise different runtime paths, so they did not expose this end-to-end CUDA speech dependency mismatch.

## Proposed Prevention

- Keep `backend\smoke_dubbing.py` deterministic by forcing ASR to CPU/int8 and TTS to CPU for the smoke process only.
- Avoid duplicating the less-stable standalone `backend\smoke_tts.py` inside the aggregate workstation harness; the dubbing smoke already exercises TTS segment synthesis.
- Preserve the production CUDA defaults in `backend\app\config.py`.
- Track CPU/GPU distribution strategy as a remaining production gate before claiming packaged workstation readiness.
