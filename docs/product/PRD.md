---
version: "1.4.1b"
created_at: "2026-09-20T18:34:22+07:00,LALIN,8429010"
last_update: "2026-09-20T22:01:00+07:00,LALIN"
status: "beta"
superseded_by: null
attributes:
  domain: "product"
  doc_type: "requirements"
  scope: "Lalin Studio baseline and Lalin Play standalone Full/Compact requirements"
---

# Product Requirements Document (PRD)

**ผลิตภัณฑ์:** Lalin Studio — AI Audio Studio ภายใต้ Lalin AI
**เวอร์ชันแอป Studio ปัจจุบัน:** 0.1.1 (แยกจากเวอร์ชันเอกสาร)
**วันที่เริ่มเอกสาร:** 2026-06-27
**ผู้จัดทำ:** G-Music Team

| Field | Value |
|-------|-------|
| **Doc Version** | 1.4.1b |
| **Status** | CR-004 Addendum A approved and implemented locally; bounded native evidence, device/release gates remain open |
| **Author** | Boss |
| **Created** | 2026-06-27 |
| **Last Updated** | 2026-09-20 |
| **Approved By** | ผู้ใช้ตอบ approve เมื่อ 2026-09-20; ไม่ใช่การอนุมัติ release/merge |

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-06-27 | Boss | ฉบับแรก |
| 1.0.1 | 2026-08-09 | Boss | เพิ่ม Document Control + เข้าระบบ doc-graph (rwang:doc-architect) |
| 1.1.0b | 2026-09-20 | LALIN | แยก Studio / Play / Cast, กำหนด Play Full/Compact และเกณฑ์ standalone ก่อนย้าย repo |
| 1.1.1b | 2026-09-20 | LALIN | บันทึก approval และ standalone foundation; migration/Studio IPC ยังไม่เสร็จ |
| 1.2.0b | 2026-09-20 | LALIN | เสนอ local video stage ใน Full/Compact ตาม CR-003; รออนุมัติ addendum |
| 1.2.1b | 2026-09-20 | LALIN | CR-003 approved; เพิ่ม local video พร้อม native evidence และข้อจำกัด |
| 1.3.0b | 2026-09-20 | LALIN | เสนอ Compact แบบ minimal overlay และ real-frame scrub preview ตาม CR-004; ยังไม่อนุมัติ/implement |
| 1.3.1b | 2026-09-20 | LALIN | CR-004 approved; minimal Compact และ real-frame preview มี local evidence พร้อมข้อจำกัด |
| 1.4.0b | 2026-09-20 | LALIN | เสนอ Compact native fullscreen และ ±10 วินาทีตาม CR-004 Addendum A; รออนุมัติ |
| 1.4.1b | 2026-09-20 | LALIN | Addendum A approved; fullscreen/±10 implemented พร้อม tests และ native evidence ที่ระบุข้อจำกัด |

---

## 1. วิสัยทัศน์ผลิตภัณฑ์

Lalin Studio (ชื่อ compatibility เดิม G-Music) เป็นแอปพลิเคชันเดสก์ท็อปสำหรับงานเสียง AI ครบวงจร ครอบคลุม **โคลนเสียง (Voice Cloning)**, **พากย์เสียงอัตโนมัติ (AI Dubbing)**, และ **มาสเตอริง (Audio Mastering)** รองรับภาษาไทยและอังกฤษเป็นหลัก ออกแบบมาเพื่อครีเอเตอร์ นักพากย์ นักดนตรี และผู้ผลิตคอนเทนต์ที่ต้องการเครื่องมือ AI เสียงคุณภาพสูงบนเครื่องของตัวเอง โดยไม่ต้องพึ่งพาบริการ cloud เพียงอย่างเดียว

### 1.1 Product portfolio และสถานะจริง

| Product | ผู้ใช้และงานหลัก | Repository / สถานะ |
|---|---|---|
| Lalin Studio | ครีเอเตอร์: สร้าง แก้ไข และผลิตงานเสียง | `Freshair129/Lalin-AI`; แอปปัจจุบัน |
| Lalin Play | ผู้ฟัง: เปิดและจัดคลังสื่อในเครื่องแบบ local Spotify + Winamp | standalone candidate ที่ `apps/play-desktop`; ยังไม่ export ไป `Freshair129/lalin-play` และยังเก็บ owner เดิมใน Studio |
| Lalin Cast | ผู้ชม: YouTube TV / Leanback และเชื่อมมือถือ | `Freshair129/lalin-cast`; แยก source แล้ว, published update gate ยังเปิด |

Play Full และ Compact เป็นสองรูปแบบของโปรดัคเดียวกัน ชื่อ Lalin Media เดิม
ถูกแทนด้วย Lalin Cast; ไม่รวม Play และ Cast เป็นโปรดัคเดียวกัน
API, MCP และ contracts เป็นส่วนประกอบของระบบ ส่วน Room/Remote/Ride ยังเป็นแนวคิดอนาคต

ข้อกำหนดและ roadmap Studio เดิมในเอกสารนี้ยังคงใช้ ส่วน §4.9 และ Flow 5–6
เป็นข้อกำหนด Play standalone ที่อนุมัติแล้วบน `codex/lalin-play-split` ดู
[ADR-004](../architecture/ADR-004-LALIN-PLAY-REPOSITORY-SPLIT.md)
สำหรับลำดับย้ายโค้ดและขอบเขตที่ต้องตรวจผ่าน

---

## 2. กลุ่มเป้าหมาย

| กลุ่ม | ความต้องการหลัก |
|-------|-----------------|
| **ครีเอเตอร์/YouTuber** | พากย์วิดีโอเป็นภาษาอื่นด้วยเสียงของตัวเอง |
| **นักพากย์อิสระ** | สร้างตัวอย่างเสียงและโคลนเสียงสำหรับงานเร่งด่วน |
| **นักดนตรี/โปรดิวเซอร์** | มาสเตอร์เพลงให้ได้มาตรฐาน Spotify/Apple Music |
| **สตูดิโอผลิตสื่อขนาดเล็ก** | พากย์คอนเทนต์จำนวนมากโดยไม่ต้องจ้างนักพากย์ทุกชิ้น |
| **นักพัฒนา/นักวิจัย AI** | ทดลอง TTS/ASR/LLM pipeline ในเครื่อง |

---

## 3. ปัญหาที่แก้

1. **บริการ cloud-only มีค่าใช้จ่ายสูง** — G-Music รัน ML model บนเครื่อง (GPU) ไม่มีค่า API ต่อนาที
2. **TTS ภาษาไทยคุณภาพต่ำ** — ใช้ F5-TTS ที่ train เฉพาะไทย ให้เสียงธรรมชาติ
3. **กระบวนการพากย์ซับซ้อน** — รวม ASR → แปล → TTS → ปรับจังหวะ → มิกซ์ ในปุ่มเดียว
4. **มาสเตอริงต้องใช้ DAW ราคาแพง** — G-Music มาสเตอร์ด้วย AI หรือ reference matching ได้ทันที
5. **ถูก lock-in กับ LLM provider เดียว** — สลับ Ollama ↔ Claude ↔ OpenAI ↔ OpenRouter ได้สดโดยไม่ต้องรีสตาร์ท

---

## 4. ฟีเจอร์หลัก

### 4.1 คลังเสียง (Voice Library)

| รายการ | รายละเอียด |
|--------|------------|
| **เพิ่มเสียง** | อัปโหลดไฟล์เสียงอ้างอิง (.wav) พร้อมชื่อ, ข้อความอ้างอิง, ภาษา |
| **จัดการ** | ดูรายการ, ลบเสียงที่ไม่ใช้ |
| **รองรับภาษา** | ไทย, อังกฤษ |
| **ระยะเวลาอ้างอิงที่แนะนำ** | 6–15 วินาที |

### 4.2 อ่านข้อความ (Text-to-Speech + Voice Cloning)

| รายการ | รายละเอียด |
|--------|------------|
| **เอนจิน** | F5-TTS (หลัก, รองรับไทย) / XTTS v2 (สำรอง, หลายภาษา) |
| **โคลนเสียง** | ใช้เสียงจากคลังเป็นต้นแบบ — zero-shot cloning |
| **ปรับความเร็ว** | 0.5×–1.5× |
| **ภาษา** | ไทย, อังกฤษ |
| **เอาต์พุต** | WAV 24kHz |

**Voice Profile และการยินยอม (ขอบเขตที่อนุมัติ):** Voice profile คือเสียงอ้างอิงที่ผู้ใช้ตั้งชื่อและจัดการเอง โดยมีคลิปอ้างอิง ข้อความถอดเสียง และภาษา การสร้างหรือแทนที่ profile ต้องยืนยันอย่างชัดเจนว่าผู้ใช้มีสิทธิ์และได้รับอนุญาตให้ใช้เสียงนั้น ไฟล์เสียงอ้างอิงจะอยู่ในเครื่อง เว้นแต่ผู้ใช้เลือกใช้บริการ cloud แยกต่างหากเอง

### 4.3 พากย์เสียง (AI Dubbing)

| รายการ | รายละเอียด |
|--------|------------|
| **อินพุต** | ไฟล์เสียง/วิดีโอ |
| **กระบวนการ** | ASR (ถอดเสียง) → แปลภาษาด้วย AI → โคลนเสียงทีละ segment → ปรับจังหวะให้ตรง → มิกซ์ timeline |
| **ถอดเสียง** | faster-whisper — ค่าเริ่มต้น `large-v3`; เลือก `base`, `small`, `medium`, `large-v3` หรือ `turbo` ได้ใน full local runtime |
| **แปลภาษา** | ผ่าน Brain (Ollama/Cloud), temperature 0.3 |
| **โคลนเสียง** | เลือกเสียงจากคลัง |
| **ปรับจังหวะ** | ยืด/หดเสียงให้ตรงกับ segment ต้นฉบับ (รักษาระดับเสียง) |
| **เอาต์พุต** | WAV (เสียงพากย์ใหม่บน timeline เดิม) |

### 4.4 มาสเตอริง (Audio Mastering)

| รายการ | รายละเอียด |
|--------|------------|
| **โหมด Reference** | ใช้เพลงอ้างอิง (Matchering 2.0) — จับคู่ EQ, loudness, dynamics |
| **โหมด Auto** | ปรับ loudness เป้าหมาย (LUFS) + peak limiting |
| **ค่า LUFS พร้อมใช้** | -14 (Spotify), -16 (Apple Music), -9 (Club/DJ) |
| **ฟอร์แมต** | WAV (lossless) / MP3 |

### 4.5 สมอง AI (Brain / LLM)

| รายการ | รายละเอียด |
|--------|------------|
| **Ollama (local)** | รันบนเครื่อง, ไม่มีค่าใช้จ่าย, ความเป็นส่วนตัวสูง |
| **Cloud** | Anthropic (Claude), OpenAI (GPT), OpenRouter (หลายโมเดล) |
| **สลับสด** | เปลี่ยน provider/model ได้ทันทีผ่าน UI โดยไม่ต้องรีสตาร์ท |
| **ใช้งาน** | แปลภาษาใน dubbing, chat อเนกประสงค์ |

### 4.6 Remix — Suno Finishing Studio (ใหม่)

| รายการ | รายละเอียด |
|--------|------------|
| **แนวคิด** | เครื่องมือเก็บงานเพลงต่อจากเพลงที่ผู้ใช้สร้างเอง (Suno) หรือเดโม่ตัวเอง |
| **กระบวนการ** | แยก stem (Demucs) → BPM/key detect → time-stretch → auto-tune → vocal FX → วางบน beat → มาสเตอร์ |
| **แยกเสียง** | Demucs (htdemucs) แยก vocal/ดนตรี |
| **Sync** | detect BPM + time-stretch + phase-align (auto) หรือ manual offset |
| **Auto-tune** | psola (PSOLA, รักษา formant) snap เข้าสเกลของ beat |
| **Vocal FX** | pedalboard chain — EQ/gate/compress/reverb/delay (ปรับได้) |
| **เอาต์พุต** | WAV มาสเตอร์ -14 LUFS |
| **จุดขาย** | local = ประมวลผลไม่จำกัด ไม่จ่ายเครดิตเหมือน Suno + เป็นเจ้าของไฟล์ตัวเอง (ถูกกฎหมาย) |
| **UI** | Timeline-first finishing workspace แบบ DAW/CapCut โดยมี `Arrange` เป็นหน้าหลัก และ `Patch` เป็น advanced view — ดู [Lalin Layout SOT](../design/LALIN_LAYOUT_SOT.md) และ [Lalin Sitemap SOT](../design/LALIN_SITEMAP_SOT.md) |

> ⚠️ deps (demucs/psola/pedalboard) บางตัวเป็น GPL → ขายเชิงพาณิชย์ใช้แบบ BYOM (ดู [ROADMAP_MUSIC.md](ROADMAP_MUSIC.md))

**UX principles for Remix**
- เรียนรู้ได้ในการใช้งานครั้งแรก โดยไม่ต้องเข้าใจ node graph ก่อน
- timeline ต้องเป็นจุดศูนย์กลางของหน้าและมองเห็นได้ตลอดในโหมด `Arrange`
- ปุ่มสำคัญต้องอยู่ในแถบบนเดียวกัน: import, save/open, mode, run
- advanced graph ต้องเป็นตัวเลือก ไม่ใช่หน้าหลัก

### 4.7 Agent Voice (ขอบเขตที่อนุมัติ)

| รายการ | รายละเอียด |
|--------|------------|
| **หน้าที่** | ให้ Mix Copilot อ่านคำตอบที่เพิ่งสร้างผ่าน voice profile ที่ผู้ใช้เลือก |
| **การควบคุม** | ปิดเป็นค่าเริ่มต้น; ผู้ใช้เลือกเปิด/ปิดและเลือก profile ได้ในจุดเดียวกับ Copilot |
| **ลำดับงาน** | ข้อความตอบกลับต้องแสดงทันที แล้วจึงสร้างเสียงเป็นงานแยกที่รายงานสถานะได้ |
| **ขอบเขต runtime** | ใช้งานได้เฉพาะ full local runtime ที่มี TTS; lite runtime ต้องบอกสถานะว่าไม่พร้อมใช้โดยไม่เริ่มงานล้มเหลว |
| **ข้อจำกัด** | ใช้ได้เฉพาะ voice profile ที่ผู้ใช้สร้างหรือมีสิทธิ์ใช้เท่านั้น |

### 4.8 ระบบอัปเดต (Auto-Update)

| รายการ | รายละเอียด |
|--------|------------|
| **ตรวจอัปเดต** | อัตโนมัติตอนเปิดแอป + ปุ่มกดเอง |
| **แหล่ง** | GitHub Releases |
| **ลายเซ็น** | ตรวจสอบ signature ก่อนติดตั้ง |
| **ติดตั้ง** | ดาวน์โหลด + ติดตั้ง + รีสตาร์ท ในแอป |

---

### 4.9 Lalin Play — Standalone local media player (approved)

สถานะ implementation: foundation มี native debug build และผู้ใช้ยืนยันได้ยิน
เสียงไฟล์ในเครื่องแล้ว; ยังไม่ผ่าน requirements ทั้งชุด ดู
[หลักฐานและงานค้าง](../validation/LALIN_PLAY_STANDALONE_FOUNDATION.md)

**เป้าหมาย:** ติดตั้งและเปิด Lalin Play เพื่อฟังไฟล์ในเครื่องได้โดยไม่ต้องเปิด
Studio, FastAPI, Ollama หรือโหลดโมเดล AI ใช้งาน offline ได้สำหรับไฟล์ที่อยู่บนดิสก์

| Surface | ลักษณะและหน้าที่ |
|---|---|
| Full | จัดคลังแบบ Spotify + Winamp: เพิ่มไฟล์/โฟลเดอร์, ค้นหา, เพลง/ศิลปิน/อัลบั้มตาม metadata จริง, playlist, queue, Now Playing และ EQ |
| Compact | Minimal Netflix-inspired: ภาพและ overlay Play/Pause, ±10 วินาที, seek/time, volume, Fullscreen, กลับ Full; audio แสดงชื่อ/neutral cover; เปิดไฟล์เมื่อว่างหรือ drag/drop; queue/EQ อยู่ใน Full |

ใช้การสลับ layout ภายในหน้าต่างเดียวในรุ่นแรก; Full ไม่ได้หมายถึง fullscreen
Audio-first foundation ถูกขยายด้วย [CR-003](CR-003--LALIN_PLAY_LOCAL_VIDEO.md)
ที่ผู้ใช้อนุมัติแล้ว: รับ MP4/WebM และแสดงภาพจริงใน Full/Compact พร้อมขยายภาพ
เต็มพื้นที่หน้าต่าง, Escape กลับ, transport/EQ ร่วม และไม่ reload ตอนสลับ layout
PLAY-V01–10 เป็นขอบเขต video ที่ดึงจาก FR-16.10 มาใช้ ไม่ใช่อนุมัติทุก codec
หรือ Phase 3 ทั้งชุด ดู [native evidence](../validation/LALIN_PLAY_LOCAL_VIDEO.md)
สำหรับสิ่งที่ตรวจผ่านและข้อจำกัด; ไม่ใช่หลักฐานว่า split/release เสร็จ

**Approved Compact addendum:** [CR-004](CR-004--LALIN_PLAY_MINIMAL_COMPACT_PREVIEW.md)
ผู้ใช้อนุมัติเมื่อ 2026-09-20 ให้ใช้ Netflix-inspired minimal overlay:
ไม่มี queue/EQ tabs หรือปุ่มรอง เหลือ Play/Pause, seek/time, volume และกลับ Full
พร้อมภาพเฟรมจริงเมื่อ hover/drag timeline โดยไม่ seek ตัวเล่นหลักจน commit
Queue/EQ และ transport ครบยังอยู่ใน Full; PLAY-03/04 ไม่ใช่ข้อบังคับให้ทุกปุ่ม
ปรากฏใน Compact มี auxiliary paused preview-only element แต่ playback owner
ยังชุดเดียว มี [local native evidence](../validation/LALIN_PLAY_MINIMAL_COMPACT.md)
สำหรับ PLAY-C01–08 พร้อมข้อจำกัด; DPI 150%/touch/profiling ยังไม่ตรวจ

**Approved extension:** CR-004 Addendum A เพิ่มปุ่ม native Fullscreen แยกจาก
กลับ Full และปุ่มย้อน/ข้าม 10 วินาทีใน Compact พร้อมคืน windowed bounds,
Escape exit และ bounded seek ที่ไม่เปลี่ยน Play/Pause หรือข้ามเพลงโดยอัตโนมัติ
PLAY-C09–13 มี implementation และ [local evidence](../validation/LALIN_PLAY_FULLSCREEN_SKIP.md)
พร้อมข้อจำกัด DPI/touch/multi-monitor; ขอบเขต single playback owner และ Full
library เดิมไม่เปลี่ยน Fullscreen ใน addendum ไม่ใช่ TV mode

| ID | ข้อกำหนด / เกณฑ์รับงาน |
|---|---|
| PLAY-01 | เปิด executable โดย Studio/API ปิดอยู่ เลือกไฟล์บนดิสก์แล้วได้ยินเสียงจริง |
| PLAY-02 | สร้าง library/playlist จากไฟล์ที่ผู้ใช้เลือก; metadata ที่ไม่มีใช้ชื่อไฟล์, ไม่สร้างศิลปิน/ปกปลอม; remove from library ไม่ลบไฟล์จริง |
| PLAY-03 | Full ↔ Compact คง media, queue, position, volume, output และ EQ; มี owner/engine เพียงหนึ่งชุด และไม่ reload media |
| PLAY-04 | คง Play/Pause/Stop/Seek/Previous/Next, queue ordering, repeat/shuffle และ EQ 10 bands + presets ตาม FR-16/17 |
| PLAY-05 | ปิด Studio แล้ว Play เล่นต่อ; minimize หรือซ่อน Play แล้วเปิดกลับได้ผ่าน tray; มีคำสั่งออกจาก Play ชัดเจน |
| PLAY-06 | เปิดแอปซ้ำหรือส่งไฟล์เพิ่มใช้ instance เดิม; Studio Play / Play Next / Add to Queue ได้ผลเดิมผ่านสัญญาใหม่ |
| PLAY-07 | เก็บ library, playlist, queue และ EQ ของ Play แยกจาก Studio/Cast; resume session เป็น opt-in และไม่ autoplay ตอนเปิดแอป |
| PLAY-08 | ไฟล์หาย/ย้าย/codec ไม่รองรับแสดงเหตุผลและให้ผู้ใช้เลือกไฟล์ใหม่; ไม่ล้าง queue ทั้งชุด |
| PLAY-09 | ย้าย queue/EQ เดิมผ่าน export/import ที่ผู้ใช้เลือก; ตรวจ version/ข้อมูล, แสดงรายการ resolve ไม่ได้ และเก็บข้อมูลเดิมไว้ |
| PLAY-10 | ติดตั้ง/ถอน Play ได้แยกจาก Studio/Cast; updater identity/key/release เป็นของ Play และต้องผ่าน gate ก่อนเปิดใช้ |

การส่งไฟล์จาก Studio ต้องได้ local file ที่ Play เปิดต่อได้แม้ backend หยุดแล้ว
metadata/title จาก Studio ใช้แสดงผลได้ แต่ไม่ใช้แทนสิทธิ์เข้าถึงไฟล์
เมื่อยังไม่มี Play ติดตั้ง ให้ Studio แสดงวิธีติดตั้ง/กำหนด executable

ข้อกำหนดเดิมเรื่อง TV presentation (FR-18) ให้คงความสามารถที่ตรวจผ่านไว้เป็น
ตัวเลือกการแสดงผลภายใน Full; ไม่เพิ่ม primary surface ที่สามและไม่เพิ่ม YouTube/DIAL เข้า Play

**Success / exit criteria:** PLAY-01 ถึง PLAY-09 ผ่านทั้ง automated checks ที่เกี่ยวข้อง
และ Windows runtime evidence; Studio/Arrange ไม่ถดถอย; standalone build ไม่อ่าน
source จาก repo แม่ ก่อนลบ implementation เดิมและ merge การแยก
PLAY-10 เป็น release gate แยกและต้องรายงาน NOT_RUN จนมีหลักฐาน installer/update จริง

---

## 5. ข้อกำหนดที่ไม่ใช่ฟังก์ชัน

ตารางนี้เป็นข้อกำหนด Studio; Play standalone ไม่ต้องการ CUDA/ML และใช้เกณฑ์ §4.9

| หัวข้อ | ข้อกำหนด |
|--------|----------|
| **แพลตฟอร์ม** | Windows 10/11 (64-bit) |
| **GPU** | NVIDIA GPU ที่มี CUDA (แนะนำ VRAM ≥ 6GB), รองรับ CPU fallback |
| **ความเป็นส่วนตัว** | ข้อมูลเสียงและ voice profile ไม่ถูกส่งออกนอกเครื่อง (ยกเว้นผู้ใช้เลือกใช้ Cloud LLM/บริการภายนอกเอง) |
| **ภาษา UI** | ไทย (หลัก) |
| **ขนาดตัวติดตั้ง** | ~3.5 MB (ไม่รวม ML models ที่โหลดแยก) |
| **ประสิทธิภาพ** | TTS ~9 วินาที/ประโยค บน RTX 3060, ASR ~0.3× realtime |

---

## 6. User Flow หลัก

### Flow 1: โคลนเสียงอ่านข้อความ
```
เปิดแอป → คลังเสียง → อัปโหลดเสียงอ้างอิง → อ่านข้อความ → พิมพ์ข้อความ
→ เลือกเสียง → กด "สร้างเสียง" → รอ (ดู progress) → ฟัง/ดาวน์โหลด
```

### Flow 2: พากย์วิดีโอเป็นภาษาอื่น
```
เปิดแอป → พากย์เสียง → อัปโหลดวิดีโอ/เสียง → เลือกเสียงพากย์
→ เลือกภาษาเป้าหมาย → กด "เริ่มพากย์" → รอ (ดู progress ทีละ segment)
→ ฟัง/ดาวน์โหลดเสียงพากย์
```

### Flow 3: มาสเตอร์เพลง
```
เปิดแอป → Mastering → อัปโหลดเพลง → (อัปโหลดเพลงอ้างอิง ถ้ามี)
→ เลือก LUFS → กด "มาสเตอร์" → รอ → ฟัง/ดาวน์โหลด
```

### Flow 4: Remix (Suno finishing studio)
```
เปิดแอป → Remix (`Arrange`) → อัปโหลดเพลง/เดโม่ (Source) + beat
→ เห็น timeline ทันที → ปรับ sync / autotune / FX / stem mix จาก device dock
→ กด ▶ Run → รอ (ดู progress: แยกร้อง→BPM→autotune→FX→mix→master) → ฟัง/ดาวน์โหลด
```

---

### Flow 5: ฟังสื่อในเครื่องด้วย Play (approved target)

เปิด Lalin Play → เพิ่มไฟล์/โฟลเดอร์ → จัด playlist หรือเลือกเพลง → เล่น
→ สลับ Full / Compact → ฟังต่อโดย queue/ตำแหน่งเล่น/EQ คงเดิม

### Flow 6: ส่งงานจาก Studio ไป Play (approved target; not implemented)

Studio Library/File Manager → เปิดด้วย Lalin Play / Play Next / Add to Queue
→ resolve ไฟล์จริง → ส่งคำสั่ง → แสดงสถานะจาก Play
→ ปิด Studio แล้ว Play ยังเล่น local file ต่อได้

---

## 7. Roadmap

### Lalin Play separation (approved plan; แยกจากเวอร์ชัน Studio ด้านล่าง)

- [x] ผู้ใช้กำหนด local player Full/Compact และอนุมัติทำใน branch แยก
- [x] Review PRD/ADR-004 และ standalone local playback foundation (native debug + ผู้ใช้ยืนยันได้ยินเสียง; ยังไม่ใช่ release)
- [ ] Full/Compact, library/playlist และ data import ผ่าน acceptance
- [ ] Studio integration ผ่าน cold/warm launch และการปิด Studio
- [ ] Export ไป repo ใหม่, ตรวจ source commit และถอน implementation เดิม
- [ ] Installer/update ของ Play ผ่าน Windows release gate

### v0.1.0 (ปัจจุบัน)
- [x] คลังเสียง + TTS + Voice Cloning (F5-TTS ไทย)
- [x] Brain (Ollama + Cloud) สลับสด
- [x] Dubbing pipeline (ASR → แปล → TTS → timeline)
- [x] Mastering (Reference + Auto)
- [x] ระบบ update + ตัวติดตั้ง NSIS
- [x] Music Remix pipeline (backend) — แยก stem/autotune/FX/master (proof-of-concept)
- [x] Cinemaro theme (นีออนไลม์ design system)

### v0.2.0 (วางแผน)
- [x] Remix UI — timeline-first `Arrange` workspace + advanced `Patch` view + ผูก `/music/remix`
- [x] Dubbing วิดีโอเต็มไฟล์ (รวมภาพ + เสียงพากย์)
- [x] Tauri sidecar — bundle backend เป็นไฟล์เดียว (validated lite-profile installer lane)
- [x] Batch processing (ส่งหลายไฟล์พร้อมกัน)
- [x] Export SRT/VTT subtitle จาก ASR
- [x] Remix: manual mixer (offset/FX sliders) + stem fader

### v0.3.0 (อนาคต)
- [ ] รองรับ macOS / Linux
- [ ] Voice fine-tuning (เทรนเสียงเพิ่ม)
- [ ] Multi-speaker dubbing (หลายตัวละคร)
- [ ] Plugin system สำหรับ pipeline ใหม่
- [ ] Voice profiles: การยินยอม, อัปโหลด/บันทึกจากไมโครโฟน, แก้ไขและ metadata ตลอด lifecycle
- [ ] ตัวเลือกขนาด Whisper พร้อมสถานะ runtime และผลตอบกลับเมื่อสลับโมเดล
- [ ] Agent Voice สำหรับ Mix Copilot ใน full local runtime

---

## 8. ตัวชี้วัดความสำเร็จ

| เมตริก | เป้าหมาย |
|--------|----------|
| **TTS คุณภาพ** | MOS ≥ 3.5/5.0 จากผู้ทดสอบไทย |
| **Dubbing accuracy** | BLEU ≥ 0.6 เทียบกับคำแปลมือ |
| **ขั้นตอนการใช้งาน** | ≤ 5 คลิกจากเปิดแอปถึงได้ผลลัพธ์ |
| **เวลาประมวลผล TTS** | ≤ 15 วินาที/ประโยค บน GPU ระดับกลาง |
| **ความเสถียร** | crash rate < 1% ต่อ session |
| **Remix learnability** | ผู้ใช้ใหม่เห็น timeline และกด render ได้โดยไม่ต้องสลับไปมุมมองกราฟ |

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 1.4.1b | 2026-09-20 | beta | Record approved fullscreen/relative seek implementation and bounded local evidence | based on 8429010 | LALIN |
| 1.4.0b | 2026-09-20 | candidate | Propose Compact fullscreen and relative seek requirements; retain approved preview baseline | based on 8429010 | LALIN |
| 1.3.1b | 2026-09-20 | beta | Record approved CR-004 and local native preview evidence; retain device/release gates | based on 8429010 | LALIN |
| 1.3.0b | 2026-09-20 | candidate | Propose CR-004 minimal Compact and isolated scrub previews; preserve approved baseline | based on 8429010 | LALIN |
| 1.2.1b | 2026-09-20 | beta | Record approved local video implementation and bounded verification | based on 8429010 | LALIN |
| 1.2.0b | 2026-09-20 | candidate | Add CR-003 local video proposal without changing approved audio baseline or claiming implementation | based on 8429010 | LALIN |
| 1.1.1b | 2026-09-20 | beta | Record approval, native foundation and remaining acceptance gates | based on 8429010 | LALIN |
| 1.1.0b | 2026-09-20 | candidate | Added Play Full/Compact product requirements and standalone migration gates; retained Studio baseline | based on 8429010 | LALIN |
| 1.0.1 | 2026-08-09 | active | Added original document control | historical; see original revision | Boss |
