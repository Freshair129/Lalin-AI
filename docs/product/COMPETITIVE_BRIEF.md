# Competitive Brief — G-Music

**วันที่:** 2026-06-28
**โฟกัส:** Feature gaps & roadmap
**ใช้เพื่อ:** จัดลำดับความสำคัญฟีเจอร์ (feature prioritization)
**คู่แข่งที่วิเคราะห์:** Thai/local, AI Dubbing, Voice cloning/TTS, Audio Mastering

| Field | Value |
|-------|-------|
| **Doc Version** | 1.0.1 |
| **Status** | Active (refresh ทุกไตรมาส) |
| **Author** | Boss |
| **Created** | 2026-06-28 |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-06-28 | Boss | ฉบับแรก (สแน็ปช็อต มิ.ย. 2026) |
| 1.0.1 | 2026-08-09 | Boss | เพิ่ม Document Control + เข้าระบบ doc-graph (rwang:doc-architect) |

> ⚠️ **ข้อควรระวัง:** ข้อมูลคู่แข่งเปลี่ยนเร็วมาก (ราคา/ฟีเจอร์) — brief นี้สแน็ปช็อต มิ.ย. 2026 ควร refresh ทุกไตรมาส

---

## 0. สรุปผู้บริหาร (TL;DR สำหรับ prioritization)

G-Music เล่นในจุดที่ไม่มีใครยึดชัด: **local-first + GPU-on-device + ฟรี/ไม่มีค่า API + ภาษาไทยคุณภาพสูง + ครบ 3 งาน (clone/dub/master) ในแอปเดียว** คู่แข่งเกือบทั้งหมดเป็น cloud SaaS คิดเงินต่อนาที/credit และไม่มีใครรวมทั้ง dubbing + mastering ในตัวเดียว

**5 ฟีเจอร์ที่ควรทำก่อน (เรียงตาม impact/effort):**

| อันดับ | ฟีเจอร์ | เหตุผลเชิงแข่งขัน | Effort |
|--------|---------|-------------------|--------|
| 1 | **Export SRT/VTT subtitle** | คู่แข่ง dubbing ทุกตัวมี เรามี ASR อยู่แล้ว ได้ของฟรีเกือบหมด | ต่ำ |
| 2 | **Batch processing** | จุดขาย local = ประมวลผลฟรีไม่จำกัด แต่ตอนนี้ทำได้ทีละไฟล์ | กลาง |
| 3 | **Multi-speaker dubbing** | Rask/HeyGen ชูเรื่องนี้ เราแพ้ชัดในงาน dubbing จริง | สูง |
| 4 | **Tauri sidecar (one-click install)** | คู่แข่งเปิดเบราว์เซอร์ก็ใช้ได้ เราต้อง setup Python/CUDA = จุดตายของ adoption | สูง |
| 5 | **Video dubbing เต็มไฟล์ + lip-sync เบื้องต้น** | ตลาด dubbing โต lip-sync เป็นมาตรฐานใหม่ | สูงมาก |

**ความเสี่ยงเชิงกลยุทธ์ที่ใหญ่ที่สุด:** F5-TTS (CC-BY-NC-4.0) และ XTTS v2 (CPML) **ห้ามใช้เชิงพาณิชย์** — ถ้า G-Music จะขาย ต้องแก้เรื่อง license ก่อนทุกอย่าง (ดู §6 Threats)

---

## 1. Landscape Map

G-Music วางตัวบนแกน **Local/On-device ↔ Cloud SaaS** และ **Single-purpose ↔ All-in-one**

```
                 All-in-one (clone+dub+master)
                          │
                          │   ● G-Music
                          │   (local, ไทย)
                          │
   Local/On-device ───────┼─────────────── Cloud SaaS
   ● F5-TTS (CLI)         │   ● ElevenLabs
   ● XTTS (CLI)           │   ● HeyGen / Rask
   ● Ozone (in-DAW)       │   ● Botnoi / iApp
                          │   ● LANDR
                          │
                  Single-purpose
```

**ช่องว่างที่ G-Music ยึดอยู่คนเดียว:** มุมขวาบน (all-in-one) + มุมซ้าย (local) → **ไม่มีคู่แข่งที่เป็นทั้ง local และ all-in-one**

---

## 2. Competitor Overview

### กลุ่ม A — Voice Cloning / TTS

| คู่แข่ง | โมเดลธุรกิจ | จุดเด่น | ภาษาไทย |
|---------|-------------|---------|---------|
| **ElevenLabs** | Cloud SaaS, $5–$1,320/mo + credit | คุณภาพเสียงระดับ best-in-class, 7 tiers, Professional Voice Cloning | รองรับ (ไม่ใช่จุดแข็ง) |
| **F5-TTS** (open source) | ฟรี CLI/web (NC license) | zero-shot clone จาก 5-15 วิ, inference เร็ว, prosody อังกฤษดี | ผ่าน fine-tune (เช่น repo ที่ G-Music ใช้) |
| **XTTS v2** (open source) | ฟรี CLI (CPML, NC) | 17 ภาษา, cross-lingual | ไม่เป็นทางการ |

### กลุ่ม B — AI Dubbing

| คู่แข่ง | โมเดลธุรกิจ | จุดเด่น | ภาษา |
|---------|-------------|---------|------|
| **HeyGen** | Cloud, free 3 วิดีโอ/เดือน | lip-sync ดีที่สุด, 175+ ภาษา, 450+ เสียง | 175+ |
| **Rask AI** | Cloud, $19–50+/mo | multi-speaker เก่งสุด, clone 32 ภาษา, script editor | 135+ |
| **ElevenLabs Dubbing** | credit-based (2,000–10,000/นาที) | คุณภาพเสียง, ดึงจาก YouTube/TikTok | 29+ |

### กลุ่ม C — Audio Mastering

| คู่แข่ง | โมเดลธุรกิจ | จุดเด่น |
|---------|-------------|---------|
| **LANDR** | Cloud SaaS + bundle (distribution) | genre-matched, master <30 วิ, ครบ ecosystem |
| **iZotope Ozone 12** | Plugin in-DAW (ซื้อขาด) | คุมละเอียดสุด, Clarity/Bass Control/Unlimiter, override ได้ทุกขั้น |
| **Matchering** (open source) | ฟรี (G-Music ใช้อยู่) | reference matching — *นี่คือ engine ของ G-Music เอง* |

### กลุ่ม D — Thai / Local players

| คู่แข่ง | โมเดลธุรกิจ | จุดเด่น |
|---------|-------------|---------|
| **Botnoi Voice** | Cloud SaaS + API + Canva plugin | 100+ เสียง, หลายภาษาเอเชีย, แบรนด์ไทย #1, ใช้ง่าย |
| **iApp Technology** (ChindaTTS/Kaitom V3) | Cloud API, "Sovereign AI" | clone ไทยจาก 10 วิ, 8 styles, streaming <1s, code-switching ไทย-อังกฤษ |
| **VAJA 8.0** (NECTEC) | Commercial license | TTS ไทย/อังกฤษงานวิจัยรัฐ (เก่า, อัปเดตช้า) |

---

## 3. Feature Comparison Matrix

เกณฑ์: **Strong** = ระดับนำตลาด / **Adequate** = ใช้ได้ / **Weak** = มีแต่จำกัด / **Absent** = ไม่มี

| Capability | G-Music | ElevenLabs | HeyGen/Rask | LANDR/Ozone | Botnoi/iApp |
|------------|---------|-----------|-------------|-------------|-------------|
| **Voice cloning (ไทย)** | Strong | Adequate | Adequate | Absent | Strong |
| **Voice cloning (อังกฤษ)** | Adequate | Strong | Strong | Absent | Adequate |
| **TTS คุณภาพเสียง** | Adequate | Strong | Strong | Absent | Strong |
| **AI Dubbing (เสียง)** | Adequate | Strong | Strong | Absent | Weak |
| **Multi-speaker dubbing** | Absent | Adequate | **Strong** | Absent | Absent |
| **Lip-sync วิดีโอ** | Absent | Adequate | **Strong** | Absent | Absent |
| **Subtitle export (SRT/VTT)** | Absent | Strong | Strong | Absent | Adequate |
| **Audio mastering** | Adequate | Absent | Absent | **Strong** | Absent |
| **Batch processing** | Absent | Strong | Strong | Strong | Adequate |
| **All-in-one (clone+dub+master)** | **Strong** | Weak | Weak | Absent | Weak |
| **Local / offline** | **Strong** | Absent | Absent | Weak(Ozone) | Absent |
| **ฟรี/ไม่มีค่า usage** | **Strong** | Weak | Weak | Weak | Weak |
| **LLM provider สลับได้** | **Strong** | Absent | Absent | Absent | Absent |
| **Privacy (ข้อมูลไม่ออกเครื่อง)** | **Strong** | Absent | Absent | Adequate | Absent |
| **ติดตั้งง่าย / one-click** | Weak | Strong | Strong | Adequate | Strong |
| **Commercial license ของ engine** | **Weak** ⚠️ | Strong | Strong | Strong | Strong |

**อ่านเมทริกซ์:** G-Music ชนะชัดในแถวล่าง (local/ฟรี/privacy/all-in-one) แต่แพ้ในงาน dubbing ขั้นสูง (multi-speaker, lip-sync), subtitle, batch, ติดตั้งง่าย — และมีจุดเปราะเรื่อง license

---

## 4. Positioning Analysis

**Positioning statement ที่แนะนำสำหรับ G-Music:**

> สำหรับ **ครีเอเตอร์และโปรดิวเซอร์ไทย** ที่ต้องการ **โคลนเสียง พากย์ และมาสเตอร์เสียงคุณภาพสูงโดยไม่จ่ายค่า subscription รายเดือนและไม่ส่งข้อมูลขึ้น cloud**, G-Music คือ **สตูดิโอเสียง AI แบบ local ครบวงจร** ที่ — ต่างจาก ElevenLabs/Botnoi ที่คิดเงินต่อนาทีและรันบน cloud — **ทำงานบน GPU เครื่องตัวเอง ใช้ได้ไม่จำกัด และเก็บข้อมูลเป็นส่วนตัว 100%**

**ช่องว่าง positioning ที่ยังว่าง (ควรยึด):**
- **"Local-first privacy"** — ไม่มีคู่แข่ง mainstream ชูเรื่องนี้ (เหมาะกับงานองค์กร/ราชการที่ห้ามข้อมูลออกนอก)
- **"จ่ายครั้งเดียว/ฟรี ไม่มี subscription"** — ทุกคู่แข่งเป็น recurring
- **"ครบในแอปเดียว"** — ไม่มีใครรวม dub + master

**ตำแหน่งที่แย่งกันแน่น (อย่าไปสู้ตรงๆ):** "เสียงเป็นธรรมชาติที่สุด" (ElevenLabs ยึดแล้ว), "ภาษาเยอะที่สุด" (HeyGen 175+)

---

## 5. Opportunities (ช่องว่างที่ควรเจาะ)

1. **องค์กร/ราชการไทยที่ห้ามข้อมูลออก cloud** — G-Music เป็นตัวเลือกเดียวที่ local 100% (iApp ชู "Sovereign AI" แต่ยังเป็น cloud API)
2. **Subtitle/transcription ฟรี** — เรามี Whisper อยู่แล้ว แค่ export SRT/VTT ก็ได้ฟีเจอร์ที่คู่แข่งคิดเงิน
3. **มาสเตอริงสำหรับครีเอเตอร์ที่ไม่มี DAW** — Ozone ต้องมี DAW + แพง, LANDR คิดเงิน; G-Music ให้ฟรีในแอป
4. **Batch แบบ unlimited** — local = ต้นทุน marginal เป็นศูนย์ จุดนี้ cloud สู้ไม่ได้เชิงต้นทุน
5. **ครีเอเตอร์ไทยที่ต้องการเสียงตัวเอง** — clone ไทยคุณภาพสูง + ฟรี เป็นคอมโบที่ Botnoi/iApp (คิดเงิน) และ ElevenLabs (ไทยไม่เด่น) ไม่มี

---

## 6. Threats (ความเสี่ยง)

| ภัยคุกคาม | ระดับ | รายละเอียด |
|-----------|-------|------------|
| **⚠️ License ของ engine** | **สูงมาก** | F5-TTS = CC-BY-NC-4.0, XTTS v2 = CPML → **ห้ามใช้เชิงพาณิชย์**. ถ้า G-Music จะขาย/หารายได้ ต้องเจรจา license, เปลี่ยน engine, หรืออยู่โมเดลฟรี/โอเพนซอร์สเท่านั้น |
| **ติดตั้งยาก = ตายตั้งแต่ต้น** | สูง | คู่แข่งเปิดเบราว์เซอร์ใช้ได้ทันที; G-Music ต้องลง Python 3.11 + CUDA + โหลดโมเดลหลาย GB → กำแพง adoption มหาศาล |
| **iApp/Botnoi เร่งเรื่อง clone ไทย** | กลาง | Kaitom V3 clone ไทยจาก 10 วิแล้ว + streaming <1s → จุดแข็งหลักของเรา (ไทย) ถูกไล่ทัน |
| **ElevenLabs/HeyGen ลงมาเล่นตลาดล่าง** | กลาง | มี free tier แล้ว ถ้าเพิ่มคุณภาพไทย + ราคาถูกลง จะกินตลาดครีเอเตอร์ไทย |
| **ต้องมี GPU** | กลาง | ครีเอเตอร์ทั่วไปไม่มี NVIDIA GPU → cloud ชนะเรื่อง accessibility |
| **Nightmare scenario** | — | ElevenLabs หรือ Botnoi ออก desktop app แบบ local + clone ไทยดี → ลบจุดต่างของเราเกือบหมด |

---

## 7. Strategic Implications — Feature Prioritization

### ทำทันที (Quick wins — impact สูง, effort ต่ำ)
- **[P0] Export SRT/VTT** — ใช้ ASR ที่มีอยู่ ปิดช่องว่างที่คู่แข่ง dubbing ทุกตัวมี
- **[P0] Batch processing** — เปลี่ยนจุดแข็ง "local = ฟรีไม่จำกัด" ให้เป็นของจริงที่ cloud สู้ไม่ได้

### ทำเพื่อแข่ง dubbing ให้ได้จริง (parity)
- **[P1] Multi-speaker dubbing** — Rask/HeyGen ยึดเรื่องนี้ ถ้าไม่มี งาน dubbing จริงเราแพ้
- **[P1] Video dubbing เต็มไฟล์** (รวมภาพ+เสียง) — ตอนนี้ออกแค่เสียง คู่แข่งออกวิดีโอเลย

### ทำเพื่อแก้จุดตาย adoption (สำคัญกว่าฟีเจอร์ใหม่)
- **[P0] Tauri sidecar / one-click installer** ที่ bundle backend + จัดการ Python/CUDA ให้ — **นี่คือคอขวดที่ใหญ่ที่สุด** ฟีเจอร์เทพแค่ไหนถ้าลงไม่ได้ก็จบ
- **[P1] CPU fallback ที่ใช้ได้จริง** — ขยายตลาดสู่คนไม่มี GPU

### ต้องตัดสินใจเชิงธุรกิจก่อน (blocker)
- **[P0 — strategic] แก้เรื่อง license** — ตัดสินใจว่า G-Music จะเป็น (ก) ฟรี/โอเพนซอร์สถาวร, (ข) เจรจา commercial license ของ F5/XTTS, หรือ (ค) เปลี่ยนไป engine ที่ commercial-friendly ก่อนคิดหารายได้

### อย่าเพิ่งทำ (differentiate ไม่ได้ / effort สูงเกิน)
- Lip-sync คุณภาพสูง — HeyGen นำไกลมาก สู้ตรงๆ ไม่คุ้ม (ทำ "เบื้องต้น" พอ)
- รองรับภาษาเยอะ — สู้ 175+ ของ HeyGen ไม่ได้ โฟกัสไทย+อังกฤษให้ลึกแทน

### สรุป positioning ที่ควรสื่อ
> เลิกพยายามเป็น "ElevenLabs ที่ถูกกว่า" — ไปเป็น **"สตูดิโอเสียง AI ไทยแบบ local ที่เป็นส่วนตัว ฟรี และครบในแอปเดียว"** แล้วลงทุนกับ 3 เสาที่คู่แข่งลอกยาก: **local privacy, all-in-one, ไทยคุณภาพสูง**

---

## 8. สิ่งที่ควร monitor ต่อ

- iApp Kaitom / ChindaTTS — คุณภาพ clone ไทย + ราคา (คู่แข่งไทยที่ใกล้ที่สุด)
- ElevenLabs / Botnoi — มี desktop/local offering ออกมาไหม (nightmare scenario)
- License ของ F5-TTS / XTTS — มีเวอร์ชัน commercial หรือ alternative ที่ license ดีกว่าไหม
- ราคา cloud dubbing — ถ้าถูกลงมาก จุดขาย "ฟรี" ของเราจะอ่อนลง

---

## แหล่งข้อมูล

- [ElevenLabs Pricing 2026](https://elevenlabs.io/pricing) · [breakdown](https://bigvu.tv/blog/elevenlabs-pricing-2026-plans-credits-commercial-rights-api-costs/)
- [HeyGen vs ElevenLabs vs Rask vs Dubverse](https://www.heygen.com/blog/heygen-vs-elevenlabs-vs-rask-ai-vs-dubverse) · [Best AI Dubbing Tools 2026](https://magichour.ai/blog/best-ai-dubbing-tools)
- [LANDR vs Ozone vs MixingGPT](https://mixinggpt.com/blog/mixinggpt-vs-landr-vs-izotope-ozone) · [iZotope Ozone 12](https://www.izotope.com/en/products/ozone)
- [Botnoi Voice](https://voice.botnoi.ai/) · [Botnoi pricing](https://botnoigroup.com/botnoivoice/doc/pricing-packages)
- [iApp Thai TTS / ChindaTTS](https://iapp.co.th/docs/speech-ai/text-to-speech) · [VAJA 8.0 NECTEC](https://www.nectec.or.th/en/innovation/service-innovation/vaja8.html)
- [F5-TTS GitHub](https://github.com/swivid/f5-tts) · [Local TTS licenses 2026](https://www.promptquorum.com/power-local-llm/local-tts-voice-cloning-piper-coqui-xtts) · [Coqui XTTS-v2](https://localaimaster.com/models/coqui-tts)
