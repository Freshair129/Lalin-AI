# Model Card — F5-TTS-THAI (TTS / Voice Cloning หลัก)

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Status** | Active |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

## ข้อมูลโมเดล

| หัวข้อ | รายละเอียด |
|---|---|
| ชื่อ / Repo | `VIZINTZOR/F5-TTS-THAI` (Hugging Face) |
| งาน (Task) | Zero-shot TTS + voice cloning ไทย + อังกฤษ |
| สถาปัตยกรรม | `F5TTS_Base` + vocos (vocoder) |
| Checkpoint / เวอร์ชัน | `model_1000000.pt` + `vocab.txt` (pin แล้ว) |
| License | **CC-BY-4.0** |
| ใช้เชิงพาณิชย์ได้? | ✅ ได้ — **ต้องให้ attribution** (ดู [AI-ETH-003](../ethics-governance.md)) |
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
