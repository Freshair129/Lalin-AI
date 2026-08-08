# Model Card — XTTS v2 (TTS fallback)

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Status** | Active (fallback) |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

## ข้อมูลโมเดล

| หัวข้อ | รายละเอียด |
|---|---|
| ชื่อ / Repo | Coqui XTTS v2 (แพ็กเกจ `TTS`) |
| งาน (Task) | Multilingual TTS + voice cloning (fallback) |
| License | **CPML (Coqui Public Model License)** |
| ใช้เชิงพาณิชย์ได้? | ❌ **non-commercial เท่านั้น** — ห้าม bundle ในเวอร์ชันขาย |
| Input → Output | text + เสียงอ้างอิง → WAV |
| ภาษา | หลายภาษา แต่ **ไม่รองรับไทย** |

## การใช้ในระบบ

- Engine สำรองตาม FR-02.4; เลือกภาษาไทยจะ fallback ไป F5-TTS อัตโนมัติ (FR-02.5)
- ติดตั้งแยก (lazy import) ผ่าน `scripts/setup_windows.ps1`

## ขีดจำกัด + ความเสี่ยง

- ⚠️ **License blocker เชิงพาณิชย์:** CPML ห้ามใช้เชิงพาณิชย์ → ต้องเป็น optional/BYOM component ไม่ bundle ใน installer ขาย (ดู [E-risk-matrix](../../appendices/E-risk-matrix.md) R-002 และ [AI-ETH-003](../ethics-governance.md))
- ไม่รองรับไทย — คุณค่าหลักของแอปไม่พึ่งโมเดลนี้; พิจารณาถอดออกจาก default ได้

## การประเมิน (Eval)

- ✏️ TODO — smoke test ภาษาอังกฤษเทียบกับ F5-TTS

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect |
