# Model Card — F5-TTS-THAI (TTS / Voice Cloning หลัก)

| Field | Value |
|-------|-------|
| **Version** | 1.1.0b |
| **Status** | Active — license under rights review |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-09-20 |
| **Approved By** | — |

## ข้อมูลโมเดล

| หัวข้อ | รายละเอียด |
|---|---|
| ชื่อ / Repo | `VIZINTZOR/F5-TTS-THAI` (Hugging Face) |
| งาน (Task) | Zero-shot TTS + voice cloning ไทย + อังกฤษ |
| สถาปัตยกรรม | `F5TTS_Base` + vocos (vocoder) |
| Checkpoint / เวอร์ชัน | `model_1000000.pt` + `vocab.txt` (pin แล้ว) |
| License | tag ของผู้ finetune: **CC-BY-4.0** · base weights `SWivid/F5-TTS`: **CC BY-NC-4.0** (ผู้เขียน F5-TTS ระบุ "pre-trained models are licensed under the CC-BY-NC license due to the training data Emilia"; code MIT) · dataset ไทยหลัก `Porameht/processed-voice-th-169k`: **CC BY-SA-4.0** — ตรวจจาก HF/GitHub 2026-09-20 |
| ใช้เชิงพาณิชย์ได้? | ⚠️ **ยังไม่ยืนยัน** — เดิมบันทึก "ได้ + attribution" จาก tag ของผู้ finetune เท่านั้น; finetune ของ weights ที่เป็น NC และข้อมูล SA ต้องให้ rights owner ตัดสิน (decision D9, [R-010](../../appendices/E-risk-matrix.md)) ก่อนใช้ใน PRP voice worker หรือ installer ที่ขาย · รายละเอียด [JAITTS_EASY_COMPARISON §2.2](../../architecture/JAITTS_EASY_COMPARISON.md) |
| Input → Output | text + เสียงอ้างอิง (.wav + ref_text) → WAV 24kHz |
| ภาษา / Sample rate | ไทย + อังกฤษในตัว / 24,000 Hz |

## การใช้ในระบบ

- โหลดที่: `backend/app/pipelines/tts.py:_get_f5()` ผ่าน `cached_path`
- รองรับ requirement: FR-02.2, FR-02.3, FR-02.5, FR-02.8 (ดู [SRS.md](../../SRS.md))
- Latency ที่วัดจริง: **inference ~9 วินาที** บน RTX 3060 12GB (ทดสอบโคลนเสียงไทยผ่านแล้ว)

## ขีดจำกัด + ความเสี่ยง

- ต้องมี ref_text ที่ตรงกับเสียงอ้างอิง — ref_text ผิดทำให้เสียงเพี้ยน
- พึ่ง checkpoint บน Hugging Face — repo หายหรือเปลี่ยน = build ใหม่พัง (ดู [E-risk-matrix](../../appendices/E-risk-matrix.md) R-005)
- ความเสี่ยง misuse โคลนเสียงคนอื่นโดยไม่ยินยอม → นโยบาย [AI-ETH-001](../ethics-governance.md)

## การประเมิน (Eval)

- Smoke test: `backend/smoke_tts.py` (โคลนเสียงไทยจริงบน RTX 3060 — ผ่านแล้ว)
- ✏️ TODO — เพิ่ม eval อัตโนมัติวัด similarity/intelligibility เมื่อเปลี่ยน checkpoint

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect (ข้อมูลจาก BLUEPRINT.yaml + CLAUDE.md) |
| 1.1.0b | 2026-09-20 | LALIN | บันทึก base-weights (CC BY-NC-4.0) และ dataset (CC BY-SA-4.0) license ที่ตรวจจาก HF/GitHub; เปลี่ยนสถานะเชิงพาณิชย์เป็น "ยังไม่ยืนยัน" รอ rights owner (D9) |
