# Roadmap — Music / "Suno Finishing Studio"

**วันที่:** 2026-06-28
**สถานะ:** Proof-of-concept พิสูจน์แล้วบน RTX 3060 12GB — โค้ดรวมที่ [backend/app/pipelines/music.py](../backend/app/pipelines/music.py)
**ที่มา:** ทดลองจริงกับเพลง Suno (`D:\suno\*.mp3`) + reference beat (`D:\ref1\*.mp4`)

---

## 1. แนวคิด (Positioning)

แทนที่จะแข่งกับ Suno (สร้างเพลง) → **เป็นเครื่องมือ downstream** ที่เก็บงานต่อ:

```
Suno เจนเพลง / เดโม่ตัวเอง  →  [G-Music]  →  แยก stem · มิกซ์ · autotune · FX · มาสเตอร์  →  เพลงเสร็จ
   (เครดิตแพง, edit จำกัด)        (local, ไม่จำกัด, ฟรี)
```

**จุดขาย:** local = ประมวลผลไม่จำกัด ไม่จ่ายต่อเครดิตเหมือน Suno + privacy + เป็นเจ้าของไฟล์ตัวเอง (ถูกกฎหมาย)

---

## 2. สิ่งที่พิสูจน์แล้ว (ทำงานจริงบน 3060)

| Feature | Library | เวลา (เพลง ~3-4 นาที) | คุณภาพ | Production? |
|---------|---------|----------------------|--------|:---:|
| มาสเตอร์ auto (LUFS) | pyloudnorm | 3.3 วิ | ดีมาก | ✅ |
| มาสเตอร์ reference | matchering | 47 วิ | ดีมาก | ✅ |
| รับ input .mp3/.mp4 | imageio-ffmpeg | เร็ว | ดี | ✅ |
| แยก stem (vocal/ดนตรี) | demucs (htdemucs) | ~10 วิ + โหลดโมเดล 7 วิครั้งแรก | ดีมาก | ✅ |
| Detect BPM | librosa | เร็ว | ดี | ✅ |
| Detect Key | librosa (Krumhansl) | เร็ว | ดี | ✅ |
| Time-stretch (BPM match) | librosa | เร็ว | ดีเมื่อ BPM ใกล้ | ✅ |
| Auto-tune | psola (PSOLA/Praat) | ~36 วิ | ดี (รักษา formant) | ✅ |
| Vocal FX (EQ/comp/reverb/delay) | pedalboard | เร็ว | ดีมาก | ✅ |
| Phase-sync (onset xcorr) | librosa | ~8 วิ | ดีเมื่อ BPM คงที่ | ⚠️ |

**สรุป:** ทั้ง pipeline "vocal → beat" ทำงานครบ vibe code ได้ รันบน 3060 สบาย (ดู §5 VRAM)

---

## 3. สิ่งที่ยังไม่เนียน / ยังขาด

| ปัญหา | สถานะ | ทางแก้ |
|-------|-------|--------|
| **Beat-sync ระดับโปร** | ⚠️ global phase ได้ แต่ drift/phrase ยังไม่จัด | **Manual nudge UI** (ให้คนเลื่อน ms + เลือกห้องเริ่ม) — DAW จริงก็ให้คนคุม |
| Piecewise warp | ❌ artifact + พึ่ง beat detection ที่ไม่เสถียร | ยังไม่คุ้ม — ใช้ manual แทน |
| Key match minor↔major | ⚠️ detect ถูก แต่ force mode อาจเพี้ยน melody | ให้ผู้ใช้ override คีย์ได้ |
| LUFS หลัง FX ตก / drift จาก target | ✅ ดีขึ้นแล้ว แต่ยังต้องยืนยัน acceptance window | ใช้ smoke gate ตรวจ output จริง พร้อม target/tolerance และ peak ceiling |
| Formant ตอน pitch-shift มาก | ⚠️ เพี้ยน timbre เมื่อ shift > 4 semitone | pyworld (formant-preserving) ถ้าต้องการ |
| ค่า FX ตอนนี้ fix | ✅ ปรับได้แล้วทั้ง tune/reverb/delay | ต่อไปโฟกัส override คีย์ + phrase start |

**บทเรียนสำคัญ:** auto beat-sync ที่ "เนียนเป๊ะ" เป็นปัญหายากที่สุด — DAW มืออาชีพ (Ableton Warp, Flex Time) ยังให้คนลาก marker เอง → **อย่าพยายาม automate 100%** ให้ auto เป็น "จุดเริ่มที่ดี" แล้วมี manual control

---

## 4. Dependencies + License (สำคัญต่อการขาย)

```bash
# ลงเพิ่ม (lazy import — แอป boot ได้แม้ยังไม่ลง)
uv pip install demucs psola pedalboard
# librosa, pyloudnorm, soundfile, matchering, imageio-ffmpeg = มีอยู่แล้ว
```

| Library | License | ขายเชิงพาณิชย์? |
|---------|---------|:---:|
| demucs | MIT | ✅ |
| librosa / pyloudnorm / soundfile | ISC/MIT/BSD | ✅ |
| matchering | GPLv3 | ⚠️ |
| psola | MIT (แต่พึ่ง **parselmouth = GPL**) | ⚠️ |
| pedalboard | GPLv3 | ⚠️ |

⚠️ **GPL contamination:** matchering, parselmouth(ผ่าน psola), pedalboard เป็น GPL → ถ้า bundle ขายตรงๆ โปรแกรมอาจติด GPL
→ **ทางแก้ = BYOM/optional component:** ให้ผู้ใช้ติดตั้งส่วน FX/autotune เองเป็น plugin แยก แอปหลัก (MIT) ไม่ bundle GPL — เข้ากับกลยุทธ์ Local-first + BYOM (ดู [COMPETITIVE_BRIEF.md](COMPETITIVE_BRIEF.md))

---

## 5. VRAM (RTX 3060 12GB) — ไหวสบาย

| โมเดล | VRAM | หมายเหตุ |
|-------|------|---------|
| Demucs | ~3-7GB | งานหนักสุดของ pipeline นี้ |
| psola/pedalboard | ~0 (CPU) | ไม่แตะ GPU |
| มาสเตอร์ | ~0 (CPU) | |

**คอขวดไม่ใช่ VRAM แต่คือการโหลดพร้อมกัน** — `music.py` เรียก `torch.cuda.empty_cache()` หลังแยก stem แล้ว
⚠️ **Ollama แย่ง VRAM** — ถ้า Ollama ถือโมเดลใหญ่อยู่ + รัน Demucs อาจ OOM → บีบ Ollama ปล่อย (`keep_alive: 0`) ก่อนงานหนัก หรือใช้ Cloud LLM ระหว่างทำเพลง

---

## 6. โครงสร้างโค้ด

[`backend/app/pipelines/music.py`](../backend/app/pipelines/music.py) — โมดูลรวม (lazy import ทุก heavy dep):

| ฟังก์ชัน | หน้าที่ |
|---------|--------|
| `separate_stems()` | Demucs แยก vocal/ดนตรี + ปล่อย VRAM |
| `detect_bpm()` / `detect_key()` | วิเคราะห์ |
| `autotune()` | psola snap เข้าสเกล |
| `vocal_fx()` | pedalboard chain (ปรับ reverb/delay/comp ได้) |
| `auto_phase_offset()` | หา offset อัตโนมัติ (onset xcorr) |
| `run_remix()` | orchestrator — คืน dict พร้อมต่อ jobs/API |

**Manual offset:** `run_remix(..., offset_ms=174)` — `None`=auto, ตัวเลข=กำหนดเอง (ms)

**API truth (ปัจจุบัน):**
- `POST /music/remix` — รัน pipeline remix เป็น background job
- `POST /music/export` — export/master FX จาก output ที่ render แล้ว
- `POST /mastering` — mastering flow แยกต่างหากสำหรับเพลงต้นฉบับ

---

## 7. แผนถัดไป (เรียงตาม priority)

### 🟢 เฟส A — เอาของที่พิสูจน์แล้วขึ้นแอป
- [x] เพิ่ม deps เป็น optional install ใน setup script (+ ตรวจตอน runtime)
- [x] Router truth-sync: `POST /music/remix`, `POST /music/export`, and `POST /mastering` are implemented through `jobs.spawn()`.
- [x] Remix LUFS/peak gate: `backend/smoke_remix.py` now verifies output LUFS and peak ceiling after writing the file.
- [x] UI: หน้า "Remix" ใช้งานได้แล้วในแอป มี source + beat upload, autotune/FX toggle, manual/auto offset, target LUFS, progress, และ output feedback
- [x] เอกสารและ setup path sync ตรงกับ implementation ปัจจุบัน

#### Definition of Done — Phase A
- ผู้ใช้เข้าแท็บ Remix จากแอปได้จริง
- backend รับงานผ่าน `POST /music/remix` และคืน `job_id`
- งาน remix แสดง progress และ output ได้ใน UI
- mastering path มี smoke verification ระดับไฟล์ output จริง
- setup/runtime path อธิบาย optional dependency ชัดเจน
- เอกสาร roadmap และ UI sitemap สะท้อนสถานะจริงตรงกับโค้ด

### 🟡 เฟส B — Manual mixer (แก้จุดที่ยังไม่เนียน)
- [x] B1: Manual nudge complete — slider เลื่อน vocal (ms) + timeline preview + run result parity
- [x] B2: FX control complete — reverb/delay + autotune strength ใน UI และ backend contract

#### Definition of Done — Phase B2 (FX control)
- ผู้ใช้ปรับ `reverb`, `delay`, และ `autotune_strength` ได้จาก Remix UI
- `POST /music/remix` รับค่า `autotune_strength` ใน backend contract
- pipeline auto-tune สะท้อนระดับ mix 0..1 โดยไม่ทำให้เส้นทางเดิม regress
- [x] B3: Musical override — เลือก/override คีย์ + จุดเริ่มห้อง (phrase)
- [x] B4: Stem mixer complete — fader ทีละ stem (vocal/drums/bass/other) พร้อม audible effect ครบ

#### Definition of Done — Phase B4 (Stem mixer)
- เมื่อปรับ `vocals`, `drums`, `bass`, `other` แล้วผลลัพธ์ remix มี audible effect จริง
- backend ใช้ `stem_gains` เพื่อแยก full stems และผสม instrumental จาก source กลับเข้า beat ปลายทางเมื่อมี non-vocal stem change
- เอกสาร UI/roadmap สะท้อนพฤติกรรมปัจจุบันตรงกับ implementation

#### Definition of Done — Phase B3 (Musical override)
- ผู้ใช้ override คีย์เป้าหมายของ auto-tune ได้จาก Remix UI
- ผู้ใช้เลือก phrase start แบบ coarse control ได้ก่อน fine nudge ด้วย `offset_ms`
- backend ใช้ `key_override` และ `phrase_bars` จริงใน `POST /music/remix`

#### Definition of Done — Phase B1 (Manual nudge)
- ผู้ใช้ปรับ `offset_ms` ได้ทั้งค่าบวกและลบ
- เมื่อปิด auto-sync, preview ใน timeline/engine สะท้อน offset ที่ตั้งก่อนกด Run
- หลัง Run, result offset ใน job feedback ตรงกับค่าที่ผู้ใช้ตั้งหรือ auto-detect ตาม mode
- ไม่มี regression กับเส้นทาง auto-sync เดิม

### 🔴 เฟส C — ขั้นสูง (ถ้าจำเป็น)
- [ ] pyworld formant-preserving สำหรับ pitch-shift มากๆ
- [ ] Piecewise beat-warp (ถ้าจะสู้ drift จริง)
- [ ] RVC singing voice conversion (consent-first + BYOM) — ดู §8

---

## 8. หมายเหตุกฎหมาย (RVC / singing voice clone)

ถ้าจะเพิ่ม "โคลนเสียงร้อง" (เฟส C):
- ✅ **ทำได้:** โคลนเสียงตัวเอง / เสียงที่มีสิทธิ์ + consent gate + BYOM (ผู้ใช้เอาโมเดลมาเอง)
- ❌ **ห้าม:** โคลนเสียงนักร้องดังโดยไม่ยินยอม → ผิด ELVIS Act / NO FAKES Act + ลิขสิทธิ์เพลง
- ดูรายละเอียดใน [COMPETITIVE_BRIEF.md](COMPETITIVE_BRIEF.md) §6-7

---

## 9. ไฟล์ทดสอบที่สร้างไว้ (data/outputs/)

| ไฟล์ | คือ |
|------|-----|
| `test_master_desire.wav` | มาสเตอร์ auto เพลง Suno |
| `test_matchering_desire.wav` | มาสเตอร์ reference |
| `HARD_desire_x_lilpeep.wav` | เพลง Suno มาสเตอร์ตาม beat โปร |
| `VOCAL_x_LILPEEP_FULLCHAIN.wav` | vocal + FX chain เต็ม |
| `VOCAL_x_LILPEEP_PHASESYNC.wav` | phase-sync เวอร์ชันล่าสุด |
| `remix_*.wav` | output จากโมดูล `music.py` |
