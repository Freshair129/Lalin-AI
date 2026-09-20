---
version: "0.1.0b"
created_at: "2026-09-21T00:40:00+07:00,LALIN,7d6235d"
last_update: "2026-09-21T00:40:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "speech-runtime-integration"
  doc_type: "validation"
  scope: "Slice B (ASR half) — faster-whisper engine behind the headless voice worker; D8 profiles asr-th-en-01 / asr-th-en-01-medium (CR-005 candidate / ADR-005)"
---

# Headless Voice Worker — Slice B evidence (ASR: faster-whisper)

**Authorization:** ผู้ใช้สั่ง "เตรียม venv แยกสำหรับ Slice B ฝั่ง ASR" → "เอา large-v3-turbo เป็นหลัก กับ medium สำรอง โหลดมาเลย" →
"เขียน manifest asr-th-en-01 ทั้ง 2 profile แล้วต่อ engine adapter เลย" พร้อมเงื่อนไข **ต้องรองรับ RTX 3060 ได้ด้วย**
Baseline `7d6235d` บน `main` · ต่อจาก [Slice A](2026-09-20-HEADLESS-VOICE-WORKER-SLICE-A.md)
**Scope:** ASR เท่านั้น — TTS ยัง BLOCKED ที่ D9/R-010 (สิทธิ์ F5-TTS-THAI) · **ไม่มี Thai-quality evidence** (ไม่มีคลิปเสียงพูดไทยที่มีสิทธิ์ใช้ในเครื่อง)

## 0. Result

| Gate | Result |
|---|---|
| Voice worker suite ใน venv หลัก (`apps/api/.venv`, ไม่มี speech stack) | **PASS 85 / SKIP 1** — engine test ข้ามอย่างชัดเจน ไม่นับเป็น PASS |
| Voice worker suite ใน speech venv (`apps/api/.venv-speech`) | **PASS 94/94** รวม 9 ข้อของ `test_engine_faster_whisper.py` (medium, cpu int8) |
| ชุดเต็ม `apps/api` (Studio regression, venv หลัก) | **171 passed, 1 skipped** |
| `compileall apps/api/app` · `schema --check` | PASS · in sync (contract ไม่เปลี่ยน) |
| Headless smoke `asr-th-en-01` (large-v3-turbo, **cuda:0 int8_float16**, RTX 5060 Ti) | **PASS** — boot → describe (`labeled_stub:false`, effective `cuda:0`) → readiness รอ `warm:true` → 401/403 → ASR SUCCEEDED บน `en-short.wav` (3.82 s เสียง, processing 0.78 s) → erase → Studio `DATA_DIR` ไม่ถูกสร้าง |
| Headless smoke `asr-th-en-01-medium` (medium, cuda:0 int8_float16) | **PASS** เงื่อนไขเดียวกัน |
| RTX 3060 | **NOT_RUN** — เครื่องนี้เป็น RTX 5060 Ti; เส้นทางนี้ไม่ใช้ torch (CTranslate2 + cuBLAS/cuDNN 12 จาก pip wheel) จึงคาดว่าใช้ได้บน Ampere แต่ยังไม่มีหลักฐาน |
| Thai transcription quality (LVP-AT-014–016) | **NOT_RUN** — ต้องมีคลิปเสียงพูดไทยที่มีสิทธิ์ใช้ก่อน |
| TTS Slice B | **BLOCKED** (D9/R-010) |
| Production activation | none |

## 1. What was built (ไม่แตะ Studio)

| Item | Path | Note |
|---|---|---|
| Speech venv | `apps/api/.venv-speech` (gitignored) + [`requirements-speech-asr.lock.txt`](../../apps/api/requirements-speech-asr.lock.txt) | requirements.txt + faster-whisper 1.2.1 + ctranslate2 4.8.2 + nvidia-cublas/cudnn cu12 wheels; **ไม่มี torch** |
| Pinned weights | `apps/api/models/faster-whisper/{large-v3-turbo,medium}` + `PINS.json` (gitignored) | `mobiuslabsgmbh/faster-whisper-large-v3-turbo`, `Systran/faster-whisper-medium` — MIT; sha256 ทุกไฟล์อยู่ใน manifest |
| Manifests (D8) | [`asr-th-en-01.json`](../../apps/api/profiles/voice-worker/asr-th-en-01.json) (primary) · [`asr-th-en-01-medium.json`](../../apps/api/profiles/voice-worker/asr-th-en-01-medium.json) (fallback) | `device: cuda:0`, `compute_type: int8_float16`, assets pinned; CPU host = แก้เป็น `cpu` + `int8` |
| Engine adapter | `app/voice_worker/engine_faster_whisper.py` | child process เดียวกับ stub protocol; `local_files_only`; job ใน thread + heartbeat/cancel ใน main loop; warm-up หลัง hello; fail-closed exit 3/4/5 (import/model/device) โดยไม่ส่ง hello |
| Profile gate | `profile.py` | allowlist `{stub, faster-whisper}`; faster-whisper ต้อง `kind=asr`, `compute_type` ใน `{int8,int8_float16,float16,float32}` (ห้าม float16 บน cpu), `beam_size` 1–10, pin `model.bin`+`config.json` ใน directory เดียว |
| Supervisor | `supervisor.py` | ส่ง `device` + `assets{role:path}` ให้ engine; readiness เพิ่มเหตุผล `warming_up` เมื่อ `residency.warm == false` |
| Runtime | `runtime.py` | ส่ง `max_audio_seconds` ให้ engine ตรวจหลัง decode (AUDIO_TOO_LARGE); qualification note ของ engine จริง |
| Tests | `tests/voice_worker/test_engine_faster_whisper.py` + fixture `fixtures/en-short.wav` (SAPI, 16 kHz) | importorskip + skip ถ้าไม่มี weights; describe ไม่ใช่ stub, ถอดเสียงอังกฤษถูก, auto-detect en, garbage → FAILED ไม่ hallucinate, `cuda:9` → EngineStartError, manifest validation ×4 |
| Smoke | `tools/verify/smoke_voice_worker_control.ps1 -Manifest … -Audio …` | ASCII-only; รอ readiness ได้ถึง 120 s; ถ้าให้ `-Audio` ต้อง SUCCEEDED จึง PASS |

## 2. Benchmark (RTX 5060 Ti 16 GB, driver 616.92, English 15.5 s, beam 5, warm)

| Model | Device / compute | Transcribe | RTF | VRAM Δ | Note |
|---|---|---|---|---|---|
| large-v3-turbo | cuda float16 | 0.33 s | 0.021 | ~2.3 GB | รอบแรกของ process 20.9 s (CUDA JIT) → warm-up ก่อน ready |
| large-v3-turbo | cuda int8_float16 | 0.32 s | 0.020 | ~1.2 GB | **ค่าหลักใน manifest** (เหมาะ 3060 ที่แบ่ง VRAM กับ Ollama) |
| medium | cuda float16 | 0.57 s | 0.037 | ~2.2 GB | |
| medium | cpu int8 | 3.9 s | 0.25 | 0 | fallback ไม่มี GPU |

ตัวเลขมาจาก `apps/api/models/faster-whisper/BENCH-en-2026-09-20.json` (gitignored) — **ไม่ใช่หลักฐานภาษาไทย และไม่ใช่หลักฐาน 3060**

## 3. Findings / gotchas

- **Windows DLL:** CTranslate2 หา `cublas64_12.dll` ไม่เจอจน `engine_faster_whisper.register_cuda_dlls()` เพิ่ม `<venv>/Lib/site-packages/nvidia/*/bin` ด้วย `os.add_dll_directory` (resolve จาก `sys.prefix`) — ทำก่อน import ทุกครั้ง
- **เครื่องนี้เป็น RTX 5060 Ti** ไม่ใช่ RTX 3060 ตาม `CLAUDE.md` — เส้นทาง TTS/torch ในอนาคตต้องใช้ cu128+ สำหรับการ์ดนี้ แต่ยังต้องรองรับ 3060 (ผู้ใช้ยืนยัน)
- Whisper เขียนตัวเลขเป็น digit ("1 2 3") — เทสต์ยอมรับทั้งสองแบบ
- `ollama list` มี `hf.co/mradermacher/qwen-tts-thai-sft-GGUF` แต่ Ollama ไม่มี audio output และ worker ห้ามแตะ Ollama → เป็นแค่ candidate ใน survey D9 ไม่ใช่ทางลัด
- Sandbox decoder (LVP-REQ-014) ยังเป็น **partial**: PyAV decode ใน engine child (ไม่ใช่ subprocess ffmpeg) — child ถูก supervisor terminate ได้, มี size/duration cap, แต่ไม่มี OS mem/CPU cap บน Windows (D13 เดิม)

## 4. Open before Slice B (ASR) can be called qualified

1. คลิปเสียงพูดไทยที่มีสิทธิ์ใช้ ≥ 3 ตัวอย่าง (สั้น/ยาว/มีเสียงรบกวน) → รัน WER/CER เทียบ turbo vs medium → บันทึกในเอกสารนี้
2. รัน smoke ทั้งสอง manifest บนเครื่อง RTX 3060 จริง (หรือ CPU int8 ถ้าไม่มี GPU) → บันทึก VRAM/RTF
3. PRP owner ยืนยัน D8 (ชื่อ/revision profile) และ D10 (residency: int8_float16 ~1.2 GB ไม่ evict LLM)
4. TTS: รอ rights owner (D9/R-010)

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-21 | beta | Slice B ASR: speech venv + pinned turbo/medium weights, two D8 manifests, faster-whisper engine adapter; 94/94 in speech venv, 171/171+1 skip in main venv, GPU smoke PASS ×2; Thai quality and RTX 3060 NOT_RUN, TTS BLOCKED | based on 7d6235d | LALIN |
