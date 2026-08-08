# Appendix E — Risk Matrix

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Status** | Active |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

ความน่าจะเป็น/ผลกระทบ: L(ต่ำ) M(กลาง) H(สูง) — ทบทวนทุกครั้งที่จะ release

| ID | ความเสี่ยง | โอกาส | ผลกระทบ | การจัดการ | เจ้าของ |
|---|---|---|---|---|---|
| R-001 | **GPL contamination** — matchering/pedalboard/parselmouth ติด GPL ถ้า bundle ขาย | H (ถ้าไม่จัดการ) | H — โมเดลธุรกิจพัง | BR-002: แยกเป็น optional plugin/BYOM ไม่ bundle ใน core ([AI-ETH-003](../ai-system/ethics-governance.md)) | Boss |
| R-002 | **XTTS v2 = CPML non-commercial** หลุดเข้า installer ขาย | M | H | ไม่ bundle · fallback ไทยเป็น F5 อยู่แล้ว (FR-02.5) · ตรวจ manifest ก่อน build | Boss |
| R-003 | **Voice clone misuse** (ปลอมเสียงหลอกลวง) กระทบชื่อเสียง/กฎหมาย | M | H | AI-ETH-001/002: consent checkbox + terms + พิจารณา watermark | Boss |
| R-004 | **VRAM 12GB ไม่พอ** เมื่อ pipeline ซ้อนกัน (dubbing+brain / remix) | M | M | โหลดทีละขั้น + `empty_cache()` · ✏️ TODO VRAM budget ([model-lifecycle](../ai-system/model-lifecycle.md) §2) | Boss |
| R-005 | **Model repo บน HF หาย/เปลี่ยน** (F5-TTS-THAI ckpt) | L | H | pin ckpt · ✏️ TODO mirror ckpt สำรอง (S3/local) + checksum | Boss |
| R-006 | **Sidecar packaging ยังไม่เคย build จริง** — เอกสารระบุ SCAFFOLDING เท่านั้น | H | M — block การ ship | ต้อง build + validate 1 รอบเต็มตาม [PACKAGING_SIDECAR.md](../PACKAGING_SIDECAR.md) ก่อนถือว่าใช้ได้ | Boss |
| R-007 | **GGUF/chat-template เสีย** ใน local model (เคยเจอ: gemma-4-12B คืน token รั่ว) | M | L | Verify Gate + ban list ใน [LOCAL_MODEL_LEDGER.md](../LOCAL_MODEL_LEDGER.md) | Boss |
| R-008 | **Backend ไม่มีเทสต์อัตโนมัติ** — regression เงียบใน pipeline | H | M | ช่องโหว่จาก [D-traceability](D-traceability.md) · ✏️ TODO เริ่มจาก unit ของ pure functions | Boss |
| R-009 | **ซาก build artifacts ปลอมตัวเป็น monorepo** — สแกน 2026-08-09 พบ `apps/api` มีแต่ `.pyc` 75 ไฟล์ (ไม่มี `.py` เลย), `apps/mcp` มีแต่ dist/node_modules, `apps/desktop` มีแต่ src-tauri bundle ~55k ไฟล์ — เสี่ยงคน/agent เข้าใจผิดว่าเป็น source จริงแล้วไปแก้ผิดที่ | H | M | **source of truth จริง = `backend/` + `frontend/`** · เพิ่ม `apps/**` ที่เป็น artifact ลง .gitignore หรือลบทิ้ง · ถ้าจะทำ monorepo จริงค่อยย้าย source แล้วอัปเดต doc-graph | Boss |

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect |
