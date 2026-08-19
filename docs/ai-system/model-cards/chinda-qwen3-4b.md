# Model Card — chinda-qwen3-4b (Brain local — แปล/สคริปต์ไทย)

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Status** | Active (แนะนำเป็น default local brain) |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

## ข้อมูลโมเดล

| หัวข้อ | รายละเอียด |
|---|---|
| ชื่อ / Tag | `hf.co/iapp/chinda-qwen3-4b-gguf:Q4_K_M` (รันผ่าน Ollama) |
| งาน (Task) | Brain local: แปลไทย↔อังกฤษ, เขียน/ปรับสคริปต์พากย์, chat |
| Base | Qwen3 4B (fine-tune ไทยโดย iApp) — **thinking model** |
| License | ✏️ TODO — ตรวจ license บน HF repo ก่อนแนะนำใน distribution (Qwen3 base = Apache-2.0) |
| ใช้เชิงพาณิชย์ได้? | ⚠️ รอตรวจ license ยืนยัน — โมเดลเป็น BYOM (ผู้ใช้ pull เอง) จึงไม่ติด bundle |
| Input → Output | messages → text (ตัด `<think>…</think>` อัตโนมัติที่ `OllamaProvider`) |

## การใช้ในระบบ

- เรียกผ่าน: `backend/app/brain/ollama_provider.py` (สลับสดกับ cloud ผ่าน `factory.py` — FR-05.1, FR-05.3)
- Thinking blocks ถูกตัดตาม FR-05.5
- **Cold-load ครั้งแรก >4 นาที** (เขี่ยโมเดลใหญ่ออกจาก VRAM) → timeout ตั้งไว้ 600s (FR-05.7); warm แล้ว ~2s

## ขีดจำกัด + ความเสี่ยง

- 4B — งานแปลยาว/ซับซ้อนอาจสู้ cloud ไม่ได้ → ผู้ใช้สลับ cloud ได้เสมอ (BYOM)
- โมเดล GGUF บางตัวใน ecosystem chat-template เสีย คืน token รั่ว — เคยเจอแล้ว (ดู [LOCAL_MODEL_LEDGER.md](../../LOCAL_MODEL_LEDGER.md)) → มี Verify Gate กันไว้

## หมายเหตุ: โมเดล local ฝั่ง dev-swarm

`qwen3:latest` (14.8B) เป็น default worker ของ dev-time swarm (คนละบทบาทกับ brain ในผลิตภัณฑ์) — บันทึกผ่าน/ตกอยู่ใน [LOCAL_MODEL_LEDGER.md](../../LOCAL_MODEL_LEDGER.md)

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect |
