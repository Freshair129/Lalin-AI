# AI Ethics & Governance — G-Music

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Status** | Draft |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

ผลิตภัณฑ์นี้**โคลนเสียงคนได้** — เป็นความสามารถที่มีความเสี่ยง misuse สูงสุดในแอป เอกสารนี้กำหนดนโยบายที่ต้องถือเป็น requirement ไม่ใช่ nice-to-have

## AI-ETH-001: Consent การโคลนเสียง

- ผู้ใช้ต้องมีสิทธิ์ในเสียงอ้างอิงที่อัปโหลด (เสียงตัวเอง หรือได้รับความยินยอมจากเจ้าของเสียง)
- ✏️ TODO — บังคับใน UX: checkbox ยืนยันสิทธิ์ตอนเพิ่มเสียงเข้าคลัง (VoicesPanel) + ข้อความนโยบายใน onboarding
- ✏️ TODO — ระบุใน EULA/terms ของตัวติดตั้ง

## AI-ETH-002: การป้องกัน misuse / disclosure

- ห้ามใช้แอปสร้างเสียงปลอมเพื่อหลอกลวง แอบอ้าง หรือใส่ร้ายบุคคล — ระบุใน terms
- ✏️ TODO — ประเมิน audio watermark ในผลลัพธ์ TTS (เทคโนโลยี + ต้นทุน CPU) — ตัดสินใจ ทำ/ไม่ทำ พร้อมเหตุผล
- ✏️ TODO — นโยบายตอบสนองเมื่อพบการ misuse (ช่องทางรายงาน)

## AI-ETH-003: License Governance (โมเดล + ไลบรารี)

สรุปจากตารางใน [ROADMAP_MUSIC.md](../ROADMAP_MUSIC.md) §4 + [model-cards/](model-cards/):

| องค์ประกอบ | License | ขายเชิงพาณิชย์ | ทางจัดการ |
|---|---|---|---|
| F5-TTS-THAI | CC-BY-4.0 | ✅ + attribution | **BR-001:** หน้า About/credits ต้องแสดง attribution |
| demucs, librosa, pyloudnorm, soundfile | MIT/ISC/BSD | ✅ | bundle ได้ |
| XTTS v2 | CPML | ❌ non-commercial | ห้าม bundle เวอร์ชันขาย → optional/BYOM |
| matchering, pedalboard | GPLv3 | ⚠️ | ห้าม bundle ใน core → plugin แยกให้ผู้ใช้ติดตั้งเอง |
| psola (→ parselmouth) | MIT (→ **GPL**) | ⚠️ | เหมือนบน — BYOM/optional |

- **BR-002:** core installer ที่ขาย ต้องไม่ bundle องค์ประกอบ GPL/CPML — ส่วนเหล่านั้นเป็น optional plugin ที่ผู้ใช้ติดตั้งเอง (กลยุทธ์ BYOM, ดู [COMPETITIVE_BRIEF.md](../COMPETITIVE_BRIEF.md))
- ✏️ TODO — ตรวจ license ของ `chinda-qwen3-4b` ก่อนแนะนำเป็น default ใน distribution
- โมเดล/ไลบรารีใหม่ทุกตัว: ต้องมี model card + แถวในตารางนี้ **ก่อน** merge เข้า main

## AI-ETH-004: Privacy (local-first)

- ไฟล์เสียงผู้ใช้ประมวลผลในเครื่องทั้งหมด — ไม่อัปโหลดขึ้น server ใด
- โหมด cloud brain: ส่งเฉพาะ**ข้อความ** (แปล/chat) ไปยัง provider ที่ผู้ใช้เลือก + API key ของผู้ใช้เอง (BYOK) เก็บ masked
- ไม่มี telemetry/analytics เก็บพฤติกรรมผู้ใช้ (ถ้าจะเพิ่มภายหลัง → ต้อง opt-in + แก้เอกสารนี้)

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect |

## Referenced Standards

- ISO/IEC 42001 (AI Management System)
