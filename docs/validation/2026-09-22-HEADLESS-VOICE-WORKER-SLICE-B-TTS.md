---
version: "0.1.0b"
created_at: "2026-09-22T23:59:00+07:00,LALIN,90971c8"
last_update: "2026-09-22T23:59:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "speech-runtime-integration"
  doc_type: "validation"
  scope: "Slice B TTS — F5-TTS-THAI engine in the headless voice worker (tts-th-preset-01), dev box; D9 approved, D19 (TTS device) raised"
---

# Headless Voice Worker — Slice B TTS evidence (F5-TTS-THAI)

**Authorization:** owner 2026-09-22: D9 approved ("D9 approve เรื่องสิทธิ์"), "เริ่มทำ TTS ใน worker เลย", download approval
for the weights and the torch/f5-tts stack onto F:, "measure both before deciding" for the device, and "use the model's
sample for now" for the preset. Baseline `90971c8`.

## 0. Result

| Gate | Result |
|---|---|
| Engine `f5-tts` in the worker (separate process, same protocol and single job thread as faster-whisper) | **PASS** |
| Cross-platform smoke on `tts-th-preset-01` (Windows, GPU) | **PASS 12/12**: synthesis SUCCEEDED, output downloads with a sha256 matching the receipt, plausible duration, unknown voice refused before compute (`VOICE_NOT_APPROVED`), over-long text 422, erase, Studio isolation |
| Tests | `.venv-tts` **168 passed** (real engine included) · `.venv-speech` **166 passed, 2 skipped** (no torch there) · `apps/api` 231 passed, 3 skipped · schema in sync; mutation checks on the voice-asset pin and the Thai chunker |
| Intelligibility (ASR round trip with large-v3-turbo, CER includes ASR error) | GPU: 0.098 (short), 0.106 (long), 0.147 (worker smoke sentence); CPU: 0.098, 0.194 |
| **D19 TTS device** | **measured, owner decision open** (§3) |
| Linux container for TTS | **NOT_RUN** (§5) |
| Production voice preset | **BLOCKED on a recording**: the shipped preset is the model repo's sample, `rights_status: dev-only` |

## 1. What was built

| Item | Where | Note |
|---|---|---|
| Engine | [`engine_f5.py`](../../apps/api/app/voice_worker/engine_f5.py) | Loads F5TTS_Base + vocos **only from pinned assets** (no HF download path); fp16 on GPU, fp32 on CPU; the reference voice is read and resampled at boot, so a bad file fails closed before hello; cancel and deadline checked between text chunks; 24 kHz mono PCM16 WAV |
| Lean imports | same | `f5_tts.model` imports its trainer (wandb, accelerate, datasets) and `utils_infer` imports matplotlib/transformers/pydub at top level. The engine stubs the trainer module (and librosa, used only by the bigvgan mel type) and reimplements the non-streaming `infer_batch_process` loop of f5-tts 1.1.22. f5-tts is installed `--no-deps` |
| Thai chunking | same, `chunk_text` | Upstream splits only at punctuation and drops the space after multi-byte characters. Thai rarely has punctuation, so an over-long sentence is now split at spaces and re-joined **with** spaces |
| Manifest | [`tts-th-preset-01.json`](../../apps/api/profiles/voice-worker/tts-th-preset-01.json) | F5-TTS-THAI `model_1000000.pt` (commit `af023c7`) + vocab + vocos-mel-24khz (commit `0feb3fd`), all sha256-pinned and matching the HF LFS hashes; `cuda:0`; th only; speed 0.8–1.2; wav |
| Profile rules | [`profile.py`](../../apps/api/app/voice_worker/profile.py) | `f5-tts` only for `kind=tts`; ckpt/vocab/vocoder must be pinned; a preset's `ref_audio` must name a pinned `voice.*` asset, so the cloned voice is traceable by hash; new rights status `dev-only` |
| Venv + lock | `.venv-tts`, [`requirements-tts.lock.txt`](../../apps/api/requirements-tts.lock.txt) | torch 2.11 cu128 (the RTX 5060 Ti needs sm_120). All caches on F: because C: had 1.9 GB free |
| Smoke | [`smoke_voice_worker.py`](../../tools/verify/smoke_voice_worker.py) `--tts-text` | TTS checks for kind=tts manifests |

## 2. Voice preset

`sample-th-dev` = `sample/ref_audio.wav` from the model repo, transcript from its README. The speaker and their consent
are unknown, so it is labelled **`dev-only`** and published as such in `describe`. D9 approves the model rights; it
does not make this recording a production voice. Before PRP use: a consented recording of 2–8 s (the model card's
advice) with its exact transcript, pinned as a `voice.*` asset with `rights_status: approved`.

## 3. D19 — TTS device (measured; owner decision)

Same engine, same two texts, sample voice, dev box (RTX 5060 Ti, i7-14700KF), NFE 32:

| | Load | Warm-up | Short (2.4 s audio) | Long (10.1 s audio) | Memory |
|---|---|---|---|---|---|
| **GPU `cuda:0`, fp16** | 11 s | 19 s | 1.1 s, **RTF 0.44** | 1.9 s, **RTF 0.19** | ~0.86 GB VRAM reserved |
| CPU, 8 threads, fp32 | 4 s | 68 s | 33.7 s, RTF 13.8 | 73.0 s, RTF 7.2 | host RAM |

On CPU the 60 s maximum output would take roughly 7 minutes; on GPU about 12 s. **Recommendation: GPU.** Unlike ASR
(D10), TTS on CPU is not usable, and the VRAM cost is under 1 GB. Trade-off: TTS then shares the GPU with the PRP LLM
when vLLM runs, and the Linux container needs GPU passthrough (§5). The shipped manifest uses `cuda:0` pending the
decision.

## 4. Known quality limits (not blocking the slice)

- The first syllable can be clipped ("สวัสดี" heard as "วัสดี").
- The tail of the reference text can leak into the start of the output: the CPU long run began with "สบาย", from the end
  of "…เย็นสบาย". A known F5 artifact.
- Names and loanwords are weaker ("ลลิน" → "ลิน", "เวิร์กเกอร์" → "เวอร์เกอร์"); the model card advises writing
  English in Thai spelling.
- Output differs between runs unless `engine_options.seed` is set (D16 applies to TTS as well).

## 5. Open

1. **D19** owner decision (§3).
2. **Production voice** (§2).
3. **Linux container for TTS**: GPU passthrough on the PRP host, a CUDA torch in the image (large), and `encodec` has no
   wheel (the image builds with `--only-binary`). Not attempted in this step.
4. Studio quality comparison (MOS/listening), mp3 output, `remove_silence` post-processing: not in scope.

## CHANGELOG

| Version | Date | Status | Change | Evidence | Author |
|---|---|---|---|---|---|
| 0.1.0b | 2026-09-22 | beta | F5-TTS engine, manifest, smoke and tests; D19 measured; dev-only voice | based on 90971c8 | LALIN |
