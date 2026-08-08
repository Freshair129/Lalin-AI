# Model Card — Demucs htdemucs (Stem Separation)

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
| ชื่อ / Repo | Demucs — โมเดล `htdemucs` (Hybrid Transformer) |
| งาน (Task) | แยก stem: vocal / instrumental (ใช้ใน Music Remix) |
| License | **MIT** ✅ |
| ใช้เชิงพาณิชย์ได้? | ✅ |
| Input → Output | mixed audio → stems (vocal, instrumental) |

## การใช้ในระบบ

- เรียกที่: `backend/app/pipelines/music.py` (ขั้น stem_split ของ Remix DAG)
- รองรับ requirement: FR-04b.2 (ดู [SRS.md](../../SRS.md))
- **Lazy import + ติดตั้งแยก:** `uv pip install demucs` (FR-04b.9)
- VRAM: หนักสุดใน remix chain — `music.py` เรียก `torch.cuda.empty_cache()` หลังแยก stem เพื่อให้ขั้นถัดไปมีที่พอ (12GB เอาอยู่ถ้าโหลดทีละขั้น)

## ขีดจำกัด + ความเสี่ยง

- เพลงที่ mix แน่น/เสียงร้องประสาน อาจแยกไม่สะอาด — ✏️ TODO เก็บตัวอย่าง fail case
- ✏️ TODO — เทียบ htdemucs vs htdemucs_ft (ช้ากว่า 4 เท่า แต่สะอาดกว่า) ว่าคุ้มไหม

## การประเมิน (Eval)

- Proof-of-concept ผ่านแล้วกับเพลง Suno จริง (ดู [ROADMAP_MUSIC.md](../../ROADMAP_MUSIC.md))

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect |
