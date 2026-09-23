---
version: "0.3.1b"
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
| **D19 TTS device** | **DECIDED 2026-09-22 by the owner: GPU** (§3) |
| Reference preparation (§4.1) | **FIXED**: pooled round-trip CER 0.137 → **0.097** (4 texts × 3 seeds), clipped first syllables gone |
| **Linux container for TTS on the GPU** (§6) | **PASS** — image 11.6 GB, suite **153 passed, 1 skipped** (the ASR module skips: no faster-whisper in this image), smoke over a Unix socket **PASS 14/14** |
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

### 2.1 Checker for a candidate recording (2026-09-24)

[`tts_voice_preset.py`](../../tools/verify/tts_voice_preset.py) checks a candidate against the limits the engine
actually enforces, then emits the `voices[]` and `assets[]` blocks with the sha256 filled in. It exists because those
limits were only in the engine source: a recording that breaks one of them fails at **worker boot**, which is a slow
and confusing place to find out.

What it measures, and why each one is not a matter of taste:

| Check | Threshold | Where it comes from |
|---|---|---|
| length **after trimming edge silence** | ≤ 12 s hard, 2–8 s recommended | `engine_f5.MAX_REF_SECONDS`; the recommendation is the model card. A file padded with silence is judged on its speech, not its duration |
| all-silence | −42 dBFS | `engine_f5.REF_SILENCE_DBFS`, the same threshold the engine trims with |
| level | RMS below −34 dBFS warns | the engine has to amplify, which lifts the noise floor with it |
| clipping | > 0.1 % of samples at full scale fails | a distorted reference clones the distortion |
| mono / sample rate | warn only | the engine downmixes and resamples to 24 kHz itself |
| transcript vs audio | 4–28 code points per second | catches a transcript that does not match what was said, which is the most common way a preset comes out wrong |

`pin` refuses to emit anything while a check fails, and **requires `--consent`**, which is written into the manifest
next to `rights_status: approved` — the status is worthless without a record of where the consent came from.

Sanity check on the known-good dev sample: 4.38 s file / 4.23 s speech, RMS −18.2 dBFS, no clipping, 14.2 code points
per second, one warning (it is stereo). 21 tests, including the narrow 8 dB band between "too quiet" and "silent".

## 3. D19 — TTS device: **GPU** (owner decision 2026-09-22, "D19 ใช้ GPU")

Same engine, same two texts, sample voice, dev box (RTX 5060 Ti, i7-14700KF), NFE 32:

| | Load | Warm-up | Short (2.4 s audio) | Long (10.1 s audio) | Memory |
|---|---|---|---|---|---|
| **GPU `cuda:0`, fp16** | 11 s | 19 s | 1.1 s, **RTF 0.44** | 1.9 s, **RTF 0.19** | ~0.86 GB VRAM reserved |
| CPU, 8 threads, fp32 | 4 s | 68 s | 33.7 s, RTF 13.8 | 73.0 s, RTF 7.2 | host RAM |

On CPU the 60 s maximum output would take roughly 7 minutes; on GPU about 12 s. **Recommendation: GPU.** Unlike ASR
(D10), TTS on CPU is not usable, and the VRAM cost is under 1 GB. Trade-off: TTS then shares the GPU with the PRP LLM
when vLLM runs, and the Linux container needs GPU passthrough (§5). The owner chose GPU; the shipped manifest uses `cuda:0`.

## 4. Quality

### 4.1 Reference preparation — fixed (2026-09-22)

The first engine skipped f5-tts's `preprocess_ref_audio_text`. Restored without pydub: the reference text must end
with ". " (a sentence boundary between the reference and the new text), silence is trimmed from both edges of the
reference audio (−42 dBFS, 10 ms steps) and 50 ms of silence appended, and a reference over 12 s is **refused at boot**
instead of being clipped silently.

A/B, same GPU, seeds 1–3, 4 texts, ASR round trip ([`ab.py`/`ab_score.py`](../../apps/api/runtime/eval/tts/), not committed):

| | Pooled CER | First syllable |
|---|---|---|
| before | 0.137 | lost in all 3 runs of "สวัสดี…", "กรุณา…" and "ขอบคุณครับ" |
| **after** | **0.097** | intact in all 9 of those runs |

The meeting sentence got slightly worse in 2 of 3 runs; part of it is the ASR writing "สิบห้า" as "15", which the
character comparison counts as errors. Mutation check: removing the ". " boundary fails its test.

### 4.2 Remaining limits

- The reference text leak ("สบาย" from "…เย็นสบาย") was seen before the fix; not seen in the 12 runs after it, but not
  proven gone.
- Names and loanwords are weaker ("ลลิน" → "ลิน", "เวิร์กเกอร์" → "เวอร์เกอร์"); the model card advises writing
  English in Thai spelling.
- Output differs between runs unless `engine_options.seed` is set (D16 applies to TTS as well).

## 6. Linux container (2026-09-23)

The owner freed space on C: (Docker's `docker_data.vhdx` lives there), so the image could be built.

| Item | Note |
|---|---|
| Stages | `tts-base` / `tts-test` / `tts-runtime` in the same [Dockerfile](../../docker/voice-worker/Dockerfile); the ASR stages are unchanged. The worker's files are copied from one `scratch` stage into both images, so ASR and TTS cannot drift |
| Lock | [`requirements-tts-linux-gpu.lock.txt`](../../apps/api/requirements-tts-linux-gpu.lock.txt) — torch 2.11.0+cu128 plus the exact `nvidia-*`/triton versions it resolved, recorded from the built image |
| `--no-deps` twice | f5-tts (training/UI stack) **and vocos**: vocos declares `encodec==0.1.1`, which ships no wheel at all, so `--only-binary` refused the first build. The engine stubs encodec; vocos's real deps are pinned instead (huggingface-hub is imported by `vocos.pretrained` at module level) |
| Size | **11.6 GB** (ASR image is 786 MB). Almost all of it is the CUDA stack |
| Run | `--gpus all`; the compose example gained a `voice-worker-tts` service under profile `tts` (own socket and data volumes, `mem_limit 6g`, read-only root, no network) |

Evidence: suite in-container **153 passed, 1 skipped** (real-engine tests confirmed running, not skipped); TTS smoke over the
Unix socket **PASS 14/14** — `cuda:0` effective, synthesis SUCCEEDED (2.81 s audio in 1.76 s), sha256 matches the receipt,
unknown voice and over-long text refused, no TCP listener.

## 5. Open

1. ~~D19~~ **decided: GPU** (§3).
2. **Production voice** (§2) — still blocked on a recording; the checker in §2.1 is ready for one.
3. ~~Linux container for TTS~~ **done (§6)**. Still open: the image is 11.6 GB, and the GPU is shared with the PRP LLM
   (no VRAM cap is enforced by the worker); a second TTS job or vLLM growth can still exhaust the GPU.
4. Studio quality comparison (MOS/listening), mp3 output, `remove_silence` post-processing: not in scope.

## CHANGELOG

| Version | Date | Status | Change | Evidence | Author |
|---|---|---|---|---|---|
| 0.3.1b | 2026-09-24 | beta | Checker for a candidate reference recording (§2.1), validated against the dev sample | based on ae4a8ae | LALIN |
| 0.3.0b | 2026-09-23 | beta | Linux GPU container built and verified (§6): suite and socket smoke pass in-container; vocos also needs --no-deps | based on 861c321 | LALIN |
| 0.2.1b | 2026-09-22 | beta | D19 decided by the owner: GPU | based on f09fb2d | LALIN |
| 0.2.0b | 2026-09-22 | beta | Reference preparation restored (CER 0.137 → 0.097); encodec dropped; container blocked on C: disk | based on 6b6b54a | LALIN |
| 0.1.0b | 2026-09-22 | beta | F5-TTS engine, manifest, smoke and tests; D19 measured; dev-only voice | based on 90971c8 | LALIN |
