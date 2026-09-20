---
version: "0.1.1c"
created_at: "2026-09-20T22:40:00+07:00,LALIN,8429010"
last_update: "2026-09-20T23:05:00+07:00,LALIN"
status: "candidate"
superseded_by: null
attributes:
  domain: "speech-runtime-integration"
  doc_type: "comparison"
  scope: "Source review of F:\\JaiTTS\\JaiTTS-Easy-main versus Lalin Studio tts.py and the CR-005 voice worker; inputs for Slice B / D8 / D9"
---

# JaiTTS-Easy เทียบกับระบบเสียงของ Lalin (source review)

**สิ่งที่ตรวจ:** `F:\JaiTTS\JaiTTS-Easy-main` (ไม่มี `.git`, ไม่มี `.venv*`, `data/`, `checkpoints/`, ไม่มี HF cache ของโมเดล) → อ่านโค้ดอย่างเดียว **ไม่ได้รัน** ไม่มีตัวเลข RMS/CER/latency ที่วัดเอง
**เทียบกับ:** `apps/api/app/pipelines/tts.py` (Studio) และ `apps/api/app/voice_worker/` (CR-005 Slice A)
**ไม่ได้อ่าน:** `.env` ใด ๆ (ไม่มีในทั้งสองฝั่ง), `docs/setup-guide.html`, `thirdparty/UniSpeech/*`

## 1. JaiTTS-Easy คืออะไร

| หัวข้อ | ข้อเท็จจริงจาก source |
|---|---|
| ตัวตน | community repackaging ของ `JTS-AI-Team/JaiTTS` (repo ต้นทางมีแต่โค้ดวัดผล) + โมเดล `JTS-AI/JaiTTS-F5TTS` (`model.pt` + `vocab.txt`) ซึ่งเป็น **F5-TTS ที่ finetune ไทย** สถาปัตยกรรม `F5TTS_Base` (dim 1024, depth 22, text_dim 512) + vocoder **vocos** 24 kHz — สถาปัตยกรรมเดียวกับ `VIZINTZOR/F5-TTS-THAI` ที่ Lalin ใช้ |
| รูปแบบใช้งาน | CLI `jaitts_synth.py` และ Gradio `jaitts_webapp.py` (127.0.0.1:7860) — **ไม่มี HTTP API / service / job / auth** ส่วน `flowtts/socket_server.py` คือ streaming example ของ F5-TTS ต้นทาง (raw TCP, `0.0.0.0:9998`, ไม่มี auth, เขียน `output.wav` ทับ) ไม่ใช่บริการที่พร้อมใช้ |
| pipeline | vendored `flowtts/` จาก `biodatlab/thonburian-tts` (MIT) ห่อ `f5_tts` อีกชั้น; ผู้เขียนวัดว่าเรียก `f5_tts.api.F5TTS` ตรง ๆ ได้เสียงเบา/มัวกว่า (RMS 0.040 vs 0.116) เพราะ pre/post-processing ไม่ใช่ weights (`CLAUDE.md`; ตัวเลขของเขา ไม่ได้ทำซ้ำที่นี่) |
| environment | สอง venv บังคับ: `.venv-tts` (f5-tts → transformers 5.x) กับ `.venv` (eval, transformers 4.57.3); Python 3.11; uv; ffmpeg ระบบ; Windows ต้องเลือก torch CUDA เอง (`setup.ps1 -Cuda`) |
| eval | CER ด้วย `typhoon-ai/typhoon-whisper-large-v3` + SIM ด้วย WavLM (`checkpoints/wavlm_large_finetune.pth` จาก Google Drive); benchmark 1,000 wav / 802 prompt-wav + `meta.lst` จาก Common Voice ไทย (ดาวน์โหลดผ่าน gdown) |

## 2. ประเด็นที่กระทบ CR-005 / LVP โดยตรง

### 2.1 Hidden downloads และ hidden ASR (LVP-REQ-007/017) — เหมือนของเราทุกจุด

| จุด | JaiTTS-Easy (`flowtts`) | Lalin Studio `tts.py` | ต้องทำใน worker (Slice B) |
|---|---|---|---|
| checkpoint/vocab | `cached_path("hf://JTS-AI/JaiTTS-F5TTS/…")` ตอนสร้าง pipeline | `cached_path("hf://VIZINTZOR/F5-TTS-THAI/…")` | โหลดจาก local path ใน manifest + sha256 เท่านั้น |
| vocoder | `load_vocoder("vocos", is_local=False)` → `hf_hub_download("charactr/vocos-mel-24khz")` **ทุกครั้งที่ไม่มี cache** | ผ่าน `f5_tts.api.F5TTS` (ดึง vocos จาก HF เช่นกัน) | ใช้ `is_local=True, local_path=<manifest asset>` — flowtts/f5_tts รองรับอยู่แล้ว |
| ref_text ว่าง | `preprocess_ref_audio_text` → `transcribe()` → โหลด `biodatlab/whisper-th-large-v3-combined` (ไทย) หรือ `openai/whisper-large-v3-turbo` แอบเพิ่ม (cache ด้วย md5 ของไฟล์) | คอมเมนต์ `"" = ให้ ASR เดาเอง` (พฤติกรรมเดียวกันใน f5_tts ต้นทาง) | manifest บังคับ `ref_text` ไม่ว่าง (ทำแล้วใน Slice A `profile.py`) + engine adapter ต้อง assert ก่อนเรียก |
| Gradio "ถอดข้อความอัตโนมัติ" | โหลด `typhoon-whisper-large-v3` อีกโมเดลใน process เดียวกัน | — | worker ไม่มี feature นี้ (preset-only) |

**ยืนยัน:** ทั้ง flowtts และ f5_tts ต้นทางมี hidden-ASR path จริง ข้อสันนิษฐานใน H0 §2.3 เป็นความจริง

### 2.2 License / rights (LVP-REQ-008, D9) — ตรวจ HF/GitHub จริงแล้ว 2026-09-20 (ผู้ใช้สั่ง)

| แหล่ง | สิ่งที่หน้าเว็บ/API ระบุ (verbatim เท่าที่ดึงได้) | วิธีตรวจ |
|---|---|---|
| `huggingface.co/JTS-AI/JaiTTS-F5TTS` | **404 — ไม่มี repo public ชื่อนี้**; `api/models?search=JaiTTS` ว่าง; `api/models?author=JTS-AI` มีเพียง `JTS-AI/OpenJAI-v1.0-14B` (apache-2.0, base Qwen3-14B) | browser + HF API |
| GitHub `JTS-AI-Team/JaiTTS` README | "License-Apache 2.0" (ของ repo วัดผล); ชี้ไปที่ org `huggingface.co/JTS-AI` เท่านั้น ไม่ระบุชื่อโมเดล/ไม่พูดถึง F5-TTS | raw README |
| arXiv 2604.27607 | abstract ระบุแค่ "code and demo are available at github.com/JTS-AI-Team/JaiTTS" — ไม่มีคำว่า weights/HF/license | arXiv abs |
| `VIZINTZOR/F5-TTS-THAI` | tag `license:cc-by-4.0`; `base_model:finetune:SWivid/F5-TTS`; `dataset:Porameht/processed-voice-th-169k`; README: "โมเดลหลัก : SWivid/F5-TTS", ข้อมูล Common Voice TH ~160 h + "Porjai Dataset" ~300 h + Common Voice EN ~40 h; **ไม่มีข้อความเรื่อง commercial use นอกจาก tag**; ไฟล์ `model_1000000.pt`, `vocab.txt`, `model/model_100000..900000.pt`, `old_small_model/*` | HF page + API |
| `SWivid/F5-TTS` (base weights) | tag **`cc-by-nc-4.0`**; checkpoints `F5TTS_v1_Base/`, `F5TTS_Base/`, `E2TTS_Base/`; GitHub README: "Our code is released under MIT License." และ **"The pre-trained models are licensed under the CC-BY-NC license due to the training data Emilia, which is an in-the-wild dataset."** | HF API + raw README |
| `Porameht/processed-voice-th-169k` (dataset ที่ F5-TTS-THAI ใช้) | tag **`cc-by-sa-4.0`** (share-alike), ไม่ gated | HF API |
| `amphion/Emilia-Dataset` | tag `cc-by-4.0`, gated auto (ต่างจากเหตุผลใน README ของ F5-TTS แต่ผู้เขียน F5-TTS เลือกประกาศ weights เป็น NC เอง) | HF API |

ข้อเท็จจริงที่ได้:
1. **JaiTTS-F5TTS ใช้ไม่ได้ในตอนนี้** — `jaitts_synth.py` hardcode `hf://JTS-AI/JaiTTS-F5TTS/model.pt` ซึ่ง 404 → JaiTTS-Easy ทั้งชุด **สร้างเสียงไม่ได้** จนกว่า JTS AI จะเผยแพร่ (หรือ repo เป็น private/gated ที่ต้องได้รับสิทธิ์) และคำกล่าวใน `THIRD_PARTY_NOTICES.md` เรื่อง Apache-2.0 ของ model card **ตรวจสอบไม่ได้**
2. **F5-TTS-THAI เป็น derivative ของ weights ที่ผู้เขียนต้นทางประกาศ CC BY-NC** — ผู้ finetune ติด tag CC-BY-4.0 แต่ไม่ได้อธิบายว่าปลด NC ของ base ได้อย่างไร และ dataset ไทยหลักเป็น CC BY-SA-4.0 (share-alike) → model card ของ Lalin (`f5-tts-thai.md`, `BLUEPRINT.yaml` "commercial OK + attribution") **บันทึกเฉพาะ tag ของผู้ finetune** ไม่ครบ
3. เอกสารนี้ **ไม่ใช่ความเห็นทางกฎหมาย** — การตีความว่า derivative ของ CC BY-NC weights ใช้เชิงพาณิชย์/ใน PRP ได้หรือไม่ เป็นของ rights owner (D9) ต้องปิดก่อน Slice B เลือก preset/model

สิทธิ์อื่นตามที่ notices ของ JaiTTS-Easy อ้าง (ไม่ได้ตรวจซ้ำ): flowtts code MIT · ThonburianTTS weights CC BY-NC-SA (ไม่ได้ใช้) · f5-tts code MIT (ยืนยันจาก README) · vocos/typhoon-whisper ตาม HF card · WavLM checkpoint จาก Google Drive · benchmark จาก Common Voice

### 2.3 Inference parameters ที่ต่างกัน (คุณภาพเสียง, LVP-REQ-018/030)

| Parameter | JaiTTS-Easy (`jaitts_synth.load`) | flowtts default | Studio `tts.py` (ผ่าน f5_tts.api) |
|---|---|---|---|
| `nfe_step` | 32 | 32 | default ของ f5_tts (ไม่ได้ตั้ง) |
| `cfg_strength` | **2.5** | 2.0 | default (2.0) |
| `target_rms` | 0.1 + normalize ref ขึ้นเมื่อ RMS < target แล้ว scale output กลับ | 0.1 | default |
| `sway_sampling_coef` | 0.0 | -1 | default (-1) |
| ref audio clip | silence-split สองรอบ, ≤ 20 s (`max_audio_length`), เติมเงียบ 200 ms | ≤ 12 s | f5_tts clip ≤ 12 s |
| ความยาวข้อความ | `chunk_text(max_chars=135 bytes)` ตัดที่ `[;:,.!?]` — **ไทยไม่มีเครื่องหมายเหล่านี้ → ทั้งข้อความเป็น chunk เดียว**; มี `split_text_into_sentences` ด้วย `pythainlp.sent_tokenize` แต่ pipeline ไม่ได้เรียกใช้ | เหมือนกัน | `remove_silence=True`, ไม่ chunk เอง |
| duration estimate | `ref_len + ref_len/ref_bytes*gen_bytes/speed` (นับ **bytes** UTF-8 — ไทย 3 bytes/char) | เหมือนกัน | ใน f5_tts |
| concurrency ของ chunk | `ThreadPoolExecutor()` ไม่จำกัด → หลาย chunk ยิง GPU พร้อมกัน | เหมือนกัน | — |
| seed | สุ่ม (`seed=-1`) | สุ่ม | สุ่ม |
| dtype | fp16 บน CUDA (major ≥ 7), fp32 ที่อื่น; `torch.load(weights_only=True)` | เหมือนกัน | ตาม f5_tts |

ผลต่อ worker: (1) generation ครั้งเดียวของ F5 รองรับ ~30 s รวม prompt (`flowtts/infer/README.md`) — ข้อความไทย 800 code points ที่ ~12 ตัวอักษร/วินาที ≈ 60 s **เกินหนึ่ง generation** และ chunker ของทั้งสองฝั่งไม่ตัดไทยได้ → Slice B ต้องมี Thai sentence chunking ของตัวเอง (pythainlp มีใน requirements-tts ของเขา แต่ **Lalin ยังไม่มี**; ต้อง review dependency + license ก่อน) หรือกำหนด limit ให้เล็กกว่า 800 ตามที่ profile ประกาศจริง (2) ค่า `nfe/cfg/target_rms/speed range/seed` ต้องเป็น **pinned `engine_options` ใน manifest** ไม่ใช่ default ลอย ๆ (3) ห้ามใช้ thread pool ไม่จำกัดใน worker — รัน chunk ทีละชิ้นเพื่อ bound VRAM (LVP-REQ-012)

### 2.4 Evaluation protocol ที่นำมาใช้ได้ (LVP §8, LVP-REQ-030)

- **CER ไทย** (`run_wer.py:process_one`): ลบ punctuation ทั้งหมด → lowercase → ลบช่องว่าง → แยกเป็นตัวอักษร → `jiwer` word-level บน token ตัวอักษร = CER; `average_wer.py` เฉลี่ยและนับ clip ที่ CER > 50% แยก — เป็น normalization protocol ที่ระบุชัด ตรงกับที่ handoff §8 เรียกร้อง ("ระบุ Unicode/whitespace/punctuation normalization") → เสนอใช้เป็น protocol ของ Lalin โดยเพิ่ม NFC ก่อน
- **silence guard** (`is_silence`: peak < 2e-3) ใช้คัด output เงียบ → ตรงกับ `validate_audio` ของ Lalin (peak < -70 dBFS) — ใช้ร่วมกันได้
- **ASR อ้างอิง** ของ benchmark คือ `typhoon-whisper-large-v3` (HF, อาจต้อง token) ไม่ใช่ faster-whisper `large-v3` ที่ Lalin ใช้ → ถ้าจะเทียบกับตัวเลข 1.94% ของ paper ต้องใช้ ASR เดียวกันในการ **วัด** (ไม่ใช่ใน worker)
- **corpus:** 802 prompt-wav ไทยพร้อม transcript (Common Voice) เป็น candidate ของ "licensed clips ≥ 120 จาก ≥ 12 speakers" สำหรับ LVP-AT-015/016 **แต่** ต้องตรวจ license ของ Common Voice (CC0) และการแจกจ่ายซ้ำผ่าน Google Drive ก่อนนำเข้า repo/CI; ยังไม่มี silence/noise-only corpus (≥ 20 clips) ในชุดนี้

### 2.5 สถาปัตยกรรมบริการ — ไม่มีอะไรให้ reuse เป็น worker

| LVP | JaiTTS-Easy | หมายเหตุ |
|---|---|---|
| 001/002 headless + allowlist | ไม่มี; Gradio/CLI เท่านั้น | — |
| 005 contract | ไม่มี | — |
| 006 process split | ทุกอย่างใน process เดียว (Gradio cache pipeline ต่อ `(nfe, cfg)` = **หลาย copy ของโมเดลในหน่วยความจำ** ถ้าผู้ใช้เปลี่ยน slider) | anti-pattern สำหรับ LVP-REQ-006/012 |
| 010/011 epoch/device | `pick_device()` auto cuda→mps→cpu | ขัด "ห้าม auto" (LVP-REQ-011) |
| 020–023 receipts/cancel | ไม่มี | — |
| 024 auth | ไม่มี (socket server bind 0.0.0.0 ไม่มี auth) | — |
| 025/026 payload | เขียน `outputs/generated.wav` ทับไฟล์เดิม, `temp_f5/` ถาวร | — |

## 3. ข้อเสนอสำหรับ Slice B / decisions

1. **D8 (model):** `JTS-AI/JaiTTS-F5TTS` **ยังเป็น candidate ไม่ได้** (ไม่มี repo public — §2.2); ถ้า JTS AI เผยแพร่ภายหลัง โหลดผ่าน loader เดียวกัน (`F5TTS_Base` + vocos) ต่างกันแค่ assets ใน manifest; การเลือกทุกกรณีต้องผ่าน (ก) rights check (ข) วัด CER/SIM ด้วย protocol §2.4 บน corpus ที่มีสิทธิ์ ไม่เลือกจากตัวเลขใน paper
2. **D9 (rights):** ข้อเท็จจริงตรวจแล้ว (§2.2): base weights CC BY-NC-4.0 ตามผู้เขียน F5-TTS, dataset ไทย CC BY-SA-4.0, tag ของ finetune CC-BY-4.0 → rights owner ต้องตัดสินว่า F5-TTS-THAI ใช้ใน PRP/เชิงพาณิชย์ได้หรือไม่ และ `f5-tts-thai.md`/`BLUEPRINT.yaml` ต้องบันทึก base/dataset license + สถานะการยืนยัน (แก้ caveat แล้ว 2026-09-20; การตัดสินยังเปิด)
3. **engine adapter (B):** ใช้ `f5_tts`/flowtts แบบ local-only (`vocoder_local_path`, ckpt/vocab path), pin `nfe_step/cfg_strength/target_rms/sway/seed` ใน `engine_options`, บังคับ `ref_text` ไม่ว่าง, ตัดข้อความไทยเป็นประโยคเอง (pythainlp เป็น candidate dependency ที่ต้อง review) และรัน chunk ตามลำดับ; ตั้ง `HF_HUB_OFFLINE=1` ใน engine process
4. **quality gate (B/C):** ใช้ Thai CER normalization ของ `run_wer.py` (+NFC) เป็น protocol ที่ freeze กับ PRP; ASR สำหรับ **วัด** เป็น decision แยกจาก ASR ใน worker
5. **ไม่ vendor flowtts** เข้า Lalin ในตอนนี้: ประโยชน์อยู่ที่ pre/post-processing (silence split, target_rms) ซึ่งเขียนเองได้ไม่กี่สิบบรรทัดและทดสอบได้ ส่วน `f5_tts` ที่ Lalin ใช้อยู่แล้วให้ `infer_process` ตัวเดียวกัน; ถ้าจะ vendor ต้องพิจารณาว่าจะเพิ่ม MIT code ~1 MB + deps (hydra/omegaconf/vocos/pythainlp)

## 4. สิ่งที่ยังไม่ได้ทำ

ไม่ได้รันโค้ดของเขา ไม่ได้วัด RMS/CER/latency ไม่ได้ติดตั้ง venv ของเขา — ตัวเลขคุณภาพทุกตัวในเอกสารนี้เป็นของผู้เขียน JaiTTS-Easy หรือของ paper; license ตรวจจาก HF/GitHub แล้ว (§2.2) แต่ไม่ได้ติดต่อผู้เผยแพร่ และไม่ใช่ความเห็นทางกฎหมาย

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1c | 2026-09-20 | candidate | Verified licenses on HF/GitHub: JaiTTS-F5TTS repo is 404/not public; F5-TTS base weights CC BY-NC-4.0 per authors; F5-TTS-THAI tag CC-BY-4.0 with CC BY-SA-4.0 Thai dataset; D8/D9 updated | based on 8429010 | LALIN |
| 0.1.0c | 2026-09-20 | candidate | Source-only comparison of JaiTTS-Easy against Studio tts.py and the CR-005 worker; license caveat, hidden-download confirmation, Thai chunking gap, eval protocol proposal | based on 8429010 | LALIN |
