# Model Card — faster-whisper large-v3 (ASR)

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
| ชื่อ / Repo | faster-whisper (CTranslate2) + weight Whisper `large-v3` |
| งาน (Task) | ASR — ถอดเสียงเป็นข้อความ + timestamps ระดับ segment + ตรวจจับภาษา |
| License | faster-whisper: MIT · weight Whisper: MIT (OpenAI) |
| ใช้เชิงพาณิชย์ได้? | ✅ |
| Input → Output | audio → segments (text + start/end + ภาษา) |
| ขนาด weight | ~3GB — **โหลดครั้งแรกตอนรัน dubbing** (ยังไม่ preload) |

## การใช้ในระบบ

- โหลดที่: `backend/app/pipelines/asr.py` (lazy — โหลดเมื่อเรียกใช้ครั้งแรก)
- รองรับ requirement: FR-03.2, FR-03.3 (ดู [SRS.md](../../SRS.md))
- Device: CUDA (RTX 3060 12GB)

## ขีดจำกัด + ความเสี่ยง

- ครั้งแรกช้ามาก (ดาวน์โหลด ~3GB) — UX ต้องแจ้ง progress ชัด
- แชร์ VRAM กับ TTS ตอน dubbing → ต้องจัดลำดับโหลด (ดู [model-lifecycle](../model-lifecycle.md))
- ✏️ TODO — วัด WER ภาษาไทยกับตัวอย่างจริง เทียบ large-v3 vs medium (ประหยัด VRAM)

## การประเมิน (Eval)

- ✏️ TODO — ชุดเสียงไทยทดสอบ + threshold WER ก่อนอัปเกรดเวอร์ชัน

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect |
