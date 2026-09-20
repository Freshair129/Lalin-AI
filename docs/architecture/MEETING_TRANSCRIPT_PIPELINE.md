---
version: "0.1.1d"
created_at: "2026-09-21T04:30:00+07:00,LALIN,b5acf61"
last_update: "2026-09-21T05:10:00+07:00,LALIN"
status: "draft"
superseded_by: null
attributes:
  domain: "speech-runtime-integration"
  doc_type: "architecture"
  scope: "Offline meeting-transcript pipeline: whisper + pyannote + Meet ring gate + context-aware correction; eval helper outside the voice-worker handoff"
---

# Meeting Transcript Pipeline (draft)

**เป้าหมาย:** จากไฟล์บันทึกประชุม (วิดีโอ Google Meet + เสียง) ให้ได้ transcript ภาษาไทยที่ **รู้ว่าใครพูด** และ **คำผิดถูกแก้ด้วย context ของบริษัท** โดยทุกบรรทัดบอกได้ว่ามาจากหลักฐานอะไร และทั้งหมดรันในเครื่อง ไม่มีข้อมูลออกนอกเครื่อง
**ขอบเขต:** เป็น **eval / productivity helper** ใน `tools/verify/` ไม่ใช่ส่วนของ voice worker (handoff = ASR/TTS เท่านั้น) ส่วนที่จะย้ายเข้า worker ต้องผ่าน D14/D15 (§7)
**สถานะ:** ขั้น 1–4 ทำงานแล้วบนไฟล์จริง 1 h 54 min (evidence ใน [Slice B §5](../validation/2026-09-21-HEADLESS-VOICE-WORKER-SLICE-B-ASR.md)); ขั้น 5–6 ยังไม่ได้สร้าง

## 0. ภาพรวม

```
                 ┌──────────────┐
  meeting.mp4 ──►│ 1. ingest    │──► audio16k.wav ─────────────┬──────────────────────────┐
                 │  (ffmpeg)    │──► frames @2fps (stream)      │                          │
                 └──────────────┘          │                    ▼                          ▼
                                           │          ┌──────────────────┐      ┌──────────────────┐
                                           │          │ 2. ASR           │      │ 3. diarization   │
                                           │          │ faster-whisper   │      │ pyannote 3.1     │
                                           │          │ turbo, th forced │      │ (audio only)     │
                                           │          │ + initial_prompt │      └────────┬─────────┘
                                           │          └────────┬─────────┘               │ turns: S1..Sn
                                           ▼                   │ segments + logprob      │
                                  ┌──────────────────┐         │                         │
                                  │ 4a. ring gate    │         │                         │
                                  │ Meet tile glow   │─────────┼─────────────────────────┤
                                  │ (pixel rule)     │  active name per frame            │
                                  └──────────────────┘         │                         │
                                                               ▼                         ▼
                                                    ┌────────────────────────────────────────┐
                                                    │ 4b. fuse                                │
                                                    │ name = ring [V] > pyannote→name [A]     │
                                                    │       > speech-no-ring = recorder [R]   │
                                                    └───────────────────┬────────────────────┘
                                                                        │ draft transcript (tagged)
                        context pack ──────────────────────────────────►▼
                        (people, glossary,                   ┌────────────────────────────┐
                         prior meetings, situation)          │ 5. narrative agent (local) │
                                                             │ qwen3.5:9b, 5-min windows  │
                                                             │ edits only where allowed   │
                                                             └──────────────┬─────────────┘
                                                                            │ corrected + diff + reasons
                                                                            ▼
                                                             ┌────────────────────────────┐
                                                             │ 6. review & export         │
                                                             │ human accepts diff → final │
                                                             │ → reference for WER        │
                                                             └────────────────────────────┘
```

## 1. Ingest

| | |
|---|---|
| Input | `*.mp4` (h264 + aac) — งานจริง 5.3 GB, 1 h 54 min |
| Audio | ffmpeg (imageio bundle) → mono 16 kHz PCM wav (220 MB) — ใช้ร่วมกันทุกขั้นเสียง |
| Video | **stream** ทีละเฟรมจาก ffmpeg `fps=2,scale=960:540` ผ่าน pipe ไม่เขียนเฟรมลงดิสก์ หน่วยความจำคงที่ ไม่ต้อง chunk |
| Privacy | ทุก output อยู่ใต้ `apps/api/runtime/` (gitignored) หรือ scratchpad ห้าม commit เสียง/เฟรม/transcript ของงานจริง |

## 2. ASR (faster-whisper)

| | |
|---|---|
| Model | `large-v3-turbo` CTranslate2, `cuda:0 int8_float16` (~1.2 GB VRAM) — medium ตกจากรายการ GPU fallback (ตกหล่นช่วงยาว, ช้ากว่า 3–4 เท่า) |
| Language | **บังคับ `th`** — auto-detect ตอบ `en` ทุก window บนประชุมไทยจริง แล้วผลิตประโยคอังกฤษมั่วทั้งไฟล์ |
| VAD | เปิด `vad_filter` (min_silence 700 ms) สำหรับไฟล์ยาว — ใน worker ปิดตาม contract (D14) |
| Context in | `initial_prompt` ≤ ~200 token จาก context pack (§5.1): ชื่อคน สินค้า ระบบ ศัพท์เฉพาะ → ลดคำผิดประเภทชื่อเฉพาะตั้งแต่ตอน decode |
| Output | `segments[]` = start/end/text/**avg_logprob/no_speech_prob** (ใช้เป็นเกณฑ์ว่า LLM แก้ได้หรือไม่ใน §5) |
| Cost | 1 h 54 min → ~7 นาทีบน RTX 5060 Ti (RTF 0.06) |

## 3. Speaker diarization (pyannote 3.1)

| | |
|---|---|
| venv | `apps/api/.venv-diar` (torch cu128 + pyannote.audio 4) แยกจาก `.venv-speech` ที่ต้องไม่มี torch |
| Access | HF login ของผู้ใช้ + ยอมรับ gated repos เอง; script ไม่รับ/ไม่พิมพ์ token |
| Output | turns `[{start,end,speaker: SPEAKER_xx}]` — รู้แค่ "เสียงแบบ A/B" ไม่รู้ชื่อ |
| Cost | 189 s บน GPU สำหรับ 1 h 54 min; ได้ 4 คลัสเตอร์ (S1–S4) |
| Known failure | คนเดียวกันไกลไมค์/เสียงเปลี่ยน → แตกเป็นคลัสเตอร์เพิ่ม (S1/S4 พูดรวมกันแค่ 4.5 นาที น่าจะเป็นเศษของ S2/S3) — ขั้น 4b/5 แก้ |

## 4. Speaker identity

### 4a. Ring gate (วิดีโอ, หลักฐานตรง)
- Google Meet วาดขอบสว่างรอบ tile ของคนที่พูดดังสุด → detect ด้วยกฎ pixel: หา tile จากสีพื้น avatar ที่รู้ (4 สี = 4 คน) → วัด luma แถบ 2–6 px นอกกรอบ → glow ถ้า p75 ≥ 150
- แยกได้ชัด: tile พูด 164–197 vs เงียบ 17–39 ทั้ง strip ปกติและ PiP เล็ก; deterministic, ไม่ใช้โมเดล, 13,700 เฟรมใน ~15 นาที
- ชื่อ ↔ สี tile อ่านครั้งเดียวจากเฟรม (คนดู หรือ vision LLM ในเครื่องเมื่อชื่อเปลี่ยน)
- **ข้อจำกัด** (ต้องมีชั้นสำรอง): ช่วงที่ Meet ไม่อยู่บนจอ, self-view ของคนอัดไม่แสดง, ไฮไลต์ได้ทีละคน

### 4b. Fuse (ลำดับหลักฐาน)
| Tag | เงื่อนไข | ความหมาย |
|---|---|---|
| `[V]` | เฟรม ≥ 40% ของ segment มี ring ของชื่อเดียวกัน | เห็นจากวิดีโอ ชี้ขาด |
| `[A]` | Meet ไม่อยู่บนจอ → ใช้ pyannote label แล้ว map เป็นชื่อจากตาราง overlap (label→ชื่อที่ ring เห็นบ่อยสุดขณะ label นั้นพูด) | เสียงอย่างเดียว |
| `[R]` | เห็น Meet, มีเสียงพูด, ไม่มี tile ไหน glow | **คนอัดเอง** (อนุมาน) |
| `?` ต่อท้าย | overlap < 50% / พูดซ้อน | ส่งให้ขั้น 5 ตัดสิน |

## 5. Narrative agent (LLM ในเครื่อง)

### 5.1 Context pack (ผู้ใช้จัดให้ เป็น text ในเครื่อง)
- ผู้ร่วมประชุม: ชื่อ บทบาท ความสัมพันธ์ ใครดูแลเรื่องอะไร
- Glossary: บริษัท แบรนด์ สินค้า ระบบ คู่ค้า ศัพท์เฉพาะ (ใช้ทั้ง `initial_prompt` §2 และขั้นนี้)
- ประชุมครั้งก่อน / สถานการณ์ปัจจุบัน → เก็บเป็นเอกสารแยก ดึงด้วย retrieval (bge-m3 ที่มีใน Ollama) เฉพาะส่วนที่เกี่ยวกับหน้าต่างนั้น ไม่ยัดทั้งหมด

### 5.2 การทำงาน
- Model: `qwen3.5:9b` (Ollama) — **chunk 5 นาที/หน้าต่าง** + overlap 30 s, ให้ตอบเป็น JSON ต่อ segment: `{id, action: keep|fix|flag, text, speaker, reason}`
- งานที่อนุญาต 3 อย่างเท่านั้น:
  1. แก้คำ **เฉพาะ** segment ที่ `avg_logprob ≥ -0.8` และ `no_speech_prob ≤ 0.5` (เสียงยังฟังได้) — ประเภท "ชื่อเฉพาะ" และ "คำไทยเพี้ยนตามเสียง"
  2. ตัดสิน speaker ของ segment ที่ติด `?` หรือ `[A]` และเสนอรวมคลัสเตอร์ pyannote ที่น่าจะเป็นคนเดียวกัน โดยใช้สรรพนาม คำลงท้าย โครงถามตอบ บทบาท
  3. `flag` segment ที่เป็นอักขระต่างภาษา/ไม่มีสัญญาณ (เช่น "obra功出来") ว่า **ไม่ได้ยิน** — ห้ามแต่งเติม
- ห้ามแตะ segment ที่ `[V]` ระบุผู้พูดแล้วเว้นแต่ flag; ห้ามเปลี่ยนความหมายประโยค; ทุก `fix` ต้องมี `reason`
- Output = transcript ใหม่ + **diff** ต่อบรรทัด (ต้นฉบับ/แก้/เหตุผล/evidence tag)

### 5.3 ทำไมไม่ให้ LLM ทำทั้งหมด
| ชั้น | ทำไมไม่ใช้ LLM |
|---|---|
| ring gate | vision LLM 1–2 s/เฟรม = 4–8 ชม. และผลไม่นิ่ง; กฎ pixel 15 นาที ตรวจสอบได้ |
| diarization จากข้อความล้วน | ประโยคสั้น ("ใช่ครับ") และช่วงพูดซ้อนไม่มีเบาะแสในตัวหนังสือ; Whisper ตัด segment ตามความเงียบไม่ใช่ตามคนเปลี่ยน |
| แก้ segment ที่ไม่มีสัญญาณ | LLM ที่รู้ context จะ "เดาอย่างมั่นใจ" ว่าควรพูดอะไร = แต่งเรื่อง |

## 6. Review & export
- คนดู diff จากขั้น 5 ยอมรับ/ปฏิเสธเป็นรายบรรทัด (เริ่มจากไฟล์ text ที่มี 2 คอลัมน์; UI ทีหลังถ้าคุ้ม)
- ผลที่ยอมรับ = **reference transcript** → ใช้คำนวณ WER/CER ของ worker profile (`asr-th-en-01`) ต่อคลิป และวัดว่า `initial_prompt` ลด error ได้กี่จุด
- export: `.txt` อ่านง่าย / `.json` (segments + speaker + evidence + edits) / `.srt` ถ้าต้องการ

## 7. สิ่งที่มีแล้ว vs ยังไม่มี

| ขั้น | สถานะ | ที่อยู่ |
|---|---|---|
| 1 ingest | ทำงานแล้ว | ffmpeg ใน `tools/verify/diarize_transcript.py` (audio); video stream ใน scratch `glow_gate.py` |
| 2 ASR | ทำงานแล้ว (ยังไม่มี `initial_prompt`) | `diarize_transcript.py transcribe` |
| 3 diarization | ทำงานแล้ว | `diarize_transcript.py diarize` |
| 4a ring gate | รันเต็มไฟล์แล้ว: Meet อยู่บนจอ 96.2% ของเวลา, ring ระบุคนได้ 66.9% ของเฟรม (ลด threshold เป็นแบบสัมพัทธ์เพราะ tile ของคนอัดเอง glow หรี่กว่า ~120 vs ~197) | `tools/verify/meet_ring_gate.py` |
| 4b fuse | รันแล้ว: 1,437 segment → `[V]` 959 / `[R]` 419 / `[A]` 59; pyannote S2+S3 = Wannapa, S1 = คนอัด (FreshAir iBozz, presenter), S0 (3.4 min) ambiguous | `tools/verify/meet_fuse_speakers.py` |
| 5 narrative agent | **ยังไม่มี** — รอ context pack จากผู้ใช้ | — |
| 6 review/export | **ยังไม่มี** | — |

## 8. Decisions ที่กระทบ voice worker (ต้องผ่าน PRP owner)
- **D14** `vad_filter` ระดับ manifest สำหรับ profile ที่รับเสียงประชุม (ตอนนี้ปิดตาม contract)
- **D15** `initial_prompt` / glossary ต่อ request หรือต่อ profile — เป็น contract change (`AsrInput` เพิ่ม field) และมี data-minimization ต้องพิจารณา (glossary อาจมีชื่อลูกค้า)
- Diarization/ring gate/narrative agent **ไม่เข้า worker** เว้นแต่ PRP เพิ่ม requirement — คงเป็นเครื่องมือ offline

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1d | 2026-09-21 | draft | Stages 4a/4b run on the full recording; ring gate and fusion scripts moved into tools/verify; relative glow threshold | based on b5acf61 | LALIN |
| 0.1.0d | 2026-09-21 | draft | First write-up of the 6-stage pipeline from the real-meeting experiments; stages 1–4 working, 5–6 not built | based on b5acf61 | LALIN |
