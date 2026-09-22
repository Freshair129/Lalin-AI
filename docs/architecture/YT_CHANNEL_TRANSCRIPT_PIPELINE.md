---
version: "0.1.0d"
created_at: "2026-09-22T21:15:00+07:00,LALIN,e6b7be2"
last_update: "2026-09-22T21:15:00+07:00,LALIN"
status: "draft"
superseded_by: null
attributes:
  domain: "speech-runtime-integration"
  doc_type: "architecture"
  scope: "YouTube channel → verified Thai transcript + reverse-engineered content playbook; 4-stage auditable pipeline (survey / metadata+social / ASR+anchored LLM correction / two-tier audit) with a mandatory WER pilot; eval helper outside the voice-worker handoff"
---

# YouTube Channel Transcript Pipeline (draft)

**เป้าหมาย:** จากช่อง YouTube ทั้งช่อง (instance แรก: 1,127 คลิป / 642 ชม.) ให้ได้ (1) transcript ภาษาไทยต่อคลิปที่ **ตรวจย้อนได้ทุกการแก้** และ (2) **content playbook** ที่แกะแผนการผลิตของช่องออกมา (format, pillar, series/arc, ปฏิทินเทศกาล, สูตรชื่อ, performance ที่ normalize แล้ว) เพื่อนำไปผลิตคอนเทนต์ต่อ
**ขอบเขต:** เป็น **eval / productivity helper** เช่นเดียวกับ [Meeting Transcript Pipeline](MEETING_TRANSCRIPT_PIPELINE.md) — ไม่ใช่ส่วนของ voice worker (handoff = ASR/TTS เท่านั้น) และไม่ใช่ feature ใน Studio UI; ใช้ venv/โมเดล/สคริปต์ของ repo นี้แต่ work_dir และสคริปต์รันอยู่นอก repo (§6)
**สิทธิ์:** ใช้ได้เฉพาะช่องที่มีการอนุญาตจากเจ้าของบันทึกไว้ใน Instance config (instance แรก: ผู้ใช้ยืนยันสิทธิ์จากเจ้าของช่อง 2026-09-22)
**สถานะ:** ออกแบบเสร็จ + หลักฐานเชิงทดลองครบสำหรับการเลือกโมเดลและ coverage ของหลักฐานจากมนุษย์ (§4); **pilot ยังไม่รัน**; Stage 2R (raw fetch ทั้งช่อง) กำลังรัน
**เอกสารปฏิบัติงาน:** [runbook/design](../operations/YT_CHANNEL_TRANSCRIPT_WORKFLOW.md) · [SOP](../operations/YT_CHANNEL_TRANSCRIPT_SOP.md)

## 0. ภาพรวม

```
Stage 2R  raw fetch (info.json lang=th + comments ≤200/คลิป) ─── ต้องมาก่อน Stage 1
   │
Stage 1   reverse-engineer content plan ──► CONTENT_PLAYBOOK.md + tags (claim · confidence · evidence · confound)
   │
Stage 2   Lane A metadata ─┐
          Lane B comments ─┼──► per-video meta/social JSON (key = video id) + glossary.json
   │
Pilot     12 คลิป × 3 ชั้น coverage · ground truth มือ · variant A/B/C · WER + fabrication ── gate ก่อน full run
   │
Stage 3   download → (Demucs?) → faster-whisper Thai + hotwords, word probs → (pyannote?) → LLM correction = diff เท่านั้น
   │
Stage 4   audit ชั้นละเอียด (word prob/flags) + ชั้นหยาบ (คอมเมนต์จากมนุษย์) → score → human review queue
```

โครง 4 stage ออกแบบโดยเจ้าของโปรเจกต์; รายละเอียดใน Stage 3-4 และลำดับ 2R→1 ปรับตามผลทดสอบใน §4

## 1. หลักการที่คุมทั้ง pipeline

1. ทุก output ชี้กลับต้นทางได้ (video id, timestamp, comment id, glossary entry, word probability)
2. "ไม่มีหลักฐาน" เป็นสถานะของตัวเอง (`no_external_evidence`, `pending_transcript`) — ไม่ใช่ "ผ่าน"
3. LLM แก้ได้เฉพาะคำที่ **เสียงยังอยู่** (คำเดิมออกเสียงใกล้เคียง + ปลายทางอยู่ใน glossary/context); ไม่มี anchor → `[ฟังไม่ชัด]`; output เป็น diff พร้อม reason
4. ทางเลือกที่เถียงกันไม่จบตัดสินด้วย WER ใน pilot ที่ **เขียนเกณฑ์ไว้ก่อนเห็นผล**
5. ทุกขั้นที่เพิ่ม × 642 ชม. — เปิดขั้นเสริมเฉพาะที่ pilot พิสูจน์

## 2. การตัดสินใจ (D-YT)

| # | การตัดสินใจ | เหตุผล/หลักฐาน |
|---|---|---|
| D-YT-1 | ASR ใช้ **biodatlab/whisper-th-large-combined** (large-v2 finetune ไทย, Apache-2.0) แปลงเป็น CTranslate2 float16; **ห้ามใช้ large-v3-turbo เป็นตัวหลัก** | ทดสอบคลิปเดียวกัน 2 ช่วง: turbo มีคำต่างภาษาแทรกทั้งคลิป; large-v3 เต็มดีขึ้นแต่ยังหลุด; Thai finetune ไทยล้วน ประโยคเชื่อมกัน (§4.1) — VAD/condition_on_previous_text ไม่ใช่ตัวแปร |
| D-YT-2 | Raw fetch ทั้งช่อง (**2R**) ต้องมาก่อน Stage 1 และต้องใช้ `--extractor-args youtube:lang=th` | flat playlist ไม่มี `upload_date` และ title ถูก YouTube auto-translate (168/1,127 = 15% เป็นอังกฤษ); หลัง `lang=th` 0/127 ไม่มีอักษรไทย (§4.3) |
| D-YT-3 | LLM correction = **roleplay แบบมี anchor**: เห็น probability ต่อคำ, แก้เฉพาะคำเสียงใกล้, ส่ง diff+reason; roleplay อิสระ (variant C) วัดใน pilot เท่านั้น | กรณีไม่มีเสียงให้ยึด LLM จะแต่ง "สิ่งที่อาจารย์น่าจะพูด" ซึ่งเนียนจนชั้นตรวจมองไม่เห็น และเป็นการเอาคำใส่ปากคนจริง (ราคา/สรรพคุณ/ชื่อครู) |
| D-YT-4 | Audit 2 ชั้น: word-level (ทุก segment) + คอมเมนต์จากมนุษย์ (ต่อคลิป); **`no_external_evidence` ห้ามให้คะแนนบวก** | Lane B แข็งมากในคลิปยอดวิวสูง (timestamp pointer, factual dispute, ราคา) แต่ครอบคลุม ~25% ของช่อง; 40% ของช่องไม่มีคอมเมนต์เนื้อหาเลย — ถ้าไม่มีสถานะนี้ กลุ่มที่ LLM แต่งได้อิสระที่สุดจะได้คะแนนสูงสุด (§4.2) |
| D-YT-5 | ขัดกับคอมเมนต์แยก 2 ความหมาย: `contradiction_transcription` (ถอดผิด) vs `contradiction_factual_dispute` (อาจารย์พูดจริง คนดูเถียงข้อเท็จจริง) | อย่างหลังไม่ใช่ error แต่เป็นจุดที่มีค่าสำหรับคอนเทนต์ → tag `controversial_claim` |
| D-YT-6 | Speaker ใช้ **pyannote diarization** (`.venv-diar`) ไม่ใช้ vision model | วิชั่นบอกได้ว่าใครอยู่ในกล้อง ไม่ใช่ใครกำลังพูด; ต้นทุนแตกเฟรมทุก segment × 642 ชม.; จำเป็นเฉพาะ format รายการทีวี (หลายคนพูด) |
| D-YT-7 | Pilot 12 คลิป (4 × rich / thin / none) บังคับก่อน full run; เกณฑ์ตัดสินเขียนล่วงหน้า | ASR อย่างเดียว ≈ 13-14 วันรันต่อเนื่อง; ทุกขั้นเสริมคูณเข้าไป; วัด WER + fabrication แยกกันเพราะ WER ลงโทษการแต่งน้อยกว่าที่ควร |
| D-YT-8 | Stage 1 = reverse-engineer **content plan** (10 ขั้น) ไม่ใช่แค่ tag taxonomy; ทุก performance claim ต้องระบุ confound ที่ตัดแล้ว | probe จากชื่อคลิปพบ confound จริง: "ชื่อมีวันที่ → views สูง" คือผลของยุครายการทีวีที่สะสมวิว 10 ปี (§4.4) |

## 3. ความสัมพันธ์กับ repo

- ใช้ `apps/api/.venv-speech` (faster-whisper 1.2.1, CUDA ผ่าน `register_cuda_dlls()` แบบเดียวกับ `app/voice_worker/engine_faster_whisper.py`), `apps/api/.venv-diar` (pyannote 4.0.7), Demucs จาก `app/pipelines/music.py`, LLM ผ่าน `app/brain/factory.py` หรือ Ollama, WER จาก `tools/verify/wer_review.py`
- glossary → `initial_prompt`/`hotwords` ต่อคลิป สอดคล้องแนวคิด **D15 per-request glossary** ของ voice worker ([D14/D15 proposal](../validation/2026-09-21-VOICE-WORKER-D14-D15-PROPOSAL.md)); ผลจาก pilot (glossary term accuracy) ใช้เป็นหลักฐานประกอบ D15 ได้
- โมเดล Thai finetune **ไม่ได้** อยู่ใน `apps/api/models/faster-whisper/PINS.json` และไม่ใช่ manifest ของ voice worker — ถ้าจะใช้ใน worker ต้องผ่าน D8 manifest + rights check แยก
- yt-dlp ติดตั้งเพิ่มใน `apps/api/.venv` เพื่อ instance นี้ (ไม่ได้เพิ่มใน `requirements.txt` — ไม่ใช่ dependency ของแอป)

## 4. หลักฐาน (instance: มันตระสยาม, 2026-09-22)

### 4.1 โมเดล ASR (คลิป xRlLGH8FLmU, ช่วง 0-3 นาที และ 10-12 นาที)
| โมเดล | ความเร็ว (audio/time) | ผล |
|---|---|---|
| large-v3-turbo (PINS) | ~8.5× | คำต่างภาษาแทรกมั่วทั้งคลิป ทุก config (VAD on/off, condition_on_previous_text, auto-lang) |
| large-v3 full | ~1.4× | ดีขึ้น ยังมีคำหลอนหลุด |
| biodatlab/whisper-th-large-combined ct2 fp16 | ~1.7-2.4× | ไทยล้วน ประโยคเชื่อมกัน ไม่มีคำต่างภาษา |

### 4.2 Coverage ของหลักฐานจากมนุษย์ (Lane B)
- 5 คลิปล่าสุด: 4 คอมเมนต์รวม ไม่มีเนื้อหา · 15 คลิปยอดวิวสูงสุด: 4-93 คอมเมนต์/คลิป, มีเนื้อหา 2-66, พบ timestamp pointer ("ฟังให้ดีก่อนจะว่าเขา 4:32"), factual dispute, ราคา, ชื่อครู · spread sample 40 คลิป: median 2, 55% มี ≥1 substantive, 20% มี ≥2
- ช่อง 2 ยุค: รายการทีวี 516 คลิป (2015-2019, คอมเมนต์มี, หลายคนพูด) / คลิปขายของ 611 คลิป (2023-2026, engagement ไป LINE, คอมเมนต์ ≈ 0); description เป็น boilerplate ทุกคลิป

### 4.3 ข้อมูลต้นทาง
- flat playlist: 1,127 คลิป, 642 ชม., เฉลี่ย 34 นาที; 168 title เป็นอังกฤษจาก auto-translate
- 2R validate บน 127 ไฟล์แรก (`lang=th`): title ไม่มีอักษรไทย 0, upload_date/comment_count ครบ, duration ตรง flat list ทุกตัว

### 4.4 Stage 1 probe (title-only, ยังไม่ normalize อายุ)
pillars: ฮู้ 14.6% · เงิน/โชค 9.7% · เทศกาลจีน 9.6% · ฮวงจุ้ย/เหมาซาน 8.2% · พิธี 6.7%; ตะกรุด (2.6%) และครูบาอาจารย์ (4.9%) มี median views สูงสุด; launch arc ซ้ำ: teaser → เปิดจอง → พิธี → recap; ปฏิทิน: ไหว้ครูรายปี, ไหว้พระจันทร์, สงกรานต์, ไท้ส่วย/รับเจ้า/ส่งเจ้าเตา, เสาร์ 5, คราส

## 5. Gates ที่ยังเปิด

- [ ] 2R เสร็จ + validate PASS + index v2 (กำลังรัน)
- [ ] Stage 1 playbook + owner sign-off (AC1.1-1.7)
- [ ] Stage 2 Lane A/B + glossary v1 (human review 200 อันดับแรก)
- [ ] Pilot: ground truth 12 × 4 นาที, WER/fabrication ต่อ variant, ปรับน้ำหนัก score, ตัดสิน B vs C และ Demucs/hotwords
- [ ] สคริปต์ที่ยังไม่มี: `_validate_fetch.py`/`_build_index.py` (มีแล้ว, ทดสอบบนข้อมูลบางส่วน), `stage1_timeline.py`, `stage2_*.py`, `transcribe_batch.py` v2, `stage3_correct.py`, `stage4_audit.py`
- [ ] ตัดสินว่าจะย้ายสคริปต์เข้า `tools/verify/` หรือคงไว้นอก repo (ตอนนี้: นอก repo ที่ work_dir)
- [ ] Full run ≈ 13-14 วัน (ASR) + ขั้นเสริมตาม pilot

## 6. ที่อยู่ของงานจริง

`F:\muntrasiam_transcripts\` (นอก repo): `WORKFLOW.md`, `SOP.md` (ต้นฉบับของเอกสาร operations ใน repo — repo เป็น canonical ตั้งแต่ commit นี้), `video_list.txt`, `channel_index.json`, `comments/*.info.json`, `models/whisper-th-large-combined-ct2/`, `transcribe_batch.py`, `_fetch_*.py`, `_validate_fetch.py`, `_build_index.py`, `_test_*.py`, `_stage1_probe.txt`

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.0d | 2026-09-22 | draft | First feature doc: 4-stage design, D-YT-1..8, model/coverage/probe evidence, open gates | based on e6b7be2 | LALIN |
