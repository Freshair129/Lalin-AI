# Prompt Engineering — G-Music

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Status** | Draft |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

รวม prompt ที่ใช้ในระบบ + กติกากลาง เพื่อให้แก้ prompt แล้วรู้ว่ากระทบจุดไหน

## กติกากลาง

1. **Thinking models:** Qwen3/DeepSeek-R1 แทรก `<think>…</think>` — `OllamaProvider` ตัดออกอัตโนมัติ (FR-05.5) ห้าม pipeline ไหน parse ข้อความก่อนตัด
2. **ภาษา:** งานแปล/สคริปต์ระบุภาษาเป้าหมายชัดเจนใน prompt เสมอ — ห้ามเดาจากบริบท
3. **โมเดลเล็ก (local):** prompt สั้น มีโครง มีตัวอย่าง — อย่ายัดบริบทยาว (4B หลุดง่าย)

## Prompt ในผลิตภัณฑ์

| จุดใช้ | ที่อยู่ | หน้าที่ | หมายเหตุ |
|---|---|---|---|
| Translate (dubbing) | `backend/app/routers/brain.py` → `POST /brain/translate` | แปลข้อความต่อ segment รักษาความยาวใกล้ต้นฉบับ | ✏️ TODO — ย้าย prompt string เป็น constant + จดเวอร์ชัน |
| Chat | `POST /brain/chat` | คุยอิสระ (BrainPanel) | streaming ได้ (FR-05.4) |
| Workspace Agent | `backend/app/routers/agent.py` | สั่งงานแอปด้วยภาษาธรรมชาติ | ✏️ TODO — จด system prompt + tool schema |

## Prompt ฝั่ง dev-time (swarm)

โครง dispatch micro-task ให้ local model (จาก [LOCAL_MODEL_LEDGER.md](../LOCAL_MODEL_LEDGER.md)):

```
ROLE/small-rules → SCAFFOLD (signature เป๊ะ) → GROUNDED CONTEXT (สั้น)
→ PAST MISTAKES (ฉีดจาก ledger) → TASK + ACCEPTANCE
output = code block เดียว
```

- ก่อน dispatch งานคล้ายเดิม **ต้อง**อ่าน "❌ PAST MISTAKES" ใน ledger แล้วฉีดเข้า prompt
- ตกแล้ว escalate ตามลำดับ: โมเดลอื่น → Sonnet → Opus (`maxReworkRounds: 1`)

## แนวปฏิบัติเมื่อแก้ prompt

1. แก้ prompt = แก้พฤติกรรม → ทดสอบด้วย input ไทยจริงอย่างน้อย 1 เคสก่อน commit
2. บันทึกการเปลี่ยนใน Version History ของไฟล์นี้ (ถือเป็น artifact เดียวกับโค้ด)

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect |
