# Appendix E — Risk Matrix

| Field | Value |
|-------|-------|
| **Version** | 1.1.0 |
| **Status** | Active |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-08-19 |
| **Approved By** | — |

ความน่าจะเป็น/ผลกระทบ: L(ต่ำ) M(กลาง) H(สูง) — ทบทวนทุกครั้งที่จะ release

| ID | ความเสี่ยง | โอกาส | ผลกระทบ | การจัดการ | เจ้าของ |
|---|---|---|---|---|---|
| R-001 | **GPL contamination** — matchering/pedalboard/parselmouth ติด GPL ถ้า bundle ขาย | H (ถ้าไม่จัดการ) | H — โมเดลธุรกิจพัง | BR-002: แยกเป็น optional plugin/BYOM ไม่ bundle ใน core ([AI-ETH-003](../ai-system/ethics-governance.md)) | Boss |
| R-002 | **XTTS v2 = CPML non-commercial** หลุดเข้า installer ขาย | M | H | ไม่ bundle · fallback ไทยเป็น F5 อยู่แล้ว (FR-02.5) · ตรวจ manifest ก่อน build | Boss |
| R-003 | **Voice clone misuse** (ปลอมเสียงหลอกลวง) กระทบชื่อเสียง/กฎหมาย | M | H | AI-ETH-001/002: consent checkbox + terms + พิจารณา watermark | Boss |
| R-004 | **VRAM 12GB ไม่พอ** เมื่อ pipeline ซ้อนกัน (dubbing+brain / remix) | M | M | โหลดทีละขั้น + `empty_cache()` · ✏️ TODO VRAM budget ([model-lifecycle](../ai-system/model-lifecycle.md) §2) | Boss |
| R-005 | **Model repo บน HF หาย/เปลี่ยน** (F5-TTS-THAI ckpt) | L | H | pin ckpt · ✏️ TODO mirror ckpt สำรอง (S3/local) + checksum | Boss |
| R-006 | **Sidecar packaging ยังไม่เคย build จริง** — เอกสารระบุ SCAFFOLDING เท่านั้น | M (เดิม H) | M — block การ ship | 🟡 **PARTIAL 2026-08-19** (PR #9): sidecar build จริงแล้ว (PyInstaller ผ่าน tracked `.spec`, bundle 458MB→237MB), boot headless + ตอบ `/health` verified ในสคริปต์เอง — ยังขาด: รัน [CLEAN_VM_CHECKLIST.md](../operations/CLEAN_VM_CHECKLIST.md) ครบ 9 แถวบนเครื่องที่ไม่มี dev toolchain จริง ๆ ก่อนจะปิดเป็น MITIGATED | Boss |
| R-007 | **GGUF/chat-template เสีย** ใน local model (เคยเจอ: gemma-4-12B คืน token รั่ว) | M | L | Verify Gate + ban list ใน [LOCAL_MODEL_LEDGER.md](../LOCAL_MODEL_LEDGER.md) | Boss |
| R-008 | **Backend ไม่มีเทสต์อัตโนมัติ** — regression เงียบใน pipeline | L (เดิม H) | M | ✅ **MITIGATED 2026-08-19** (PR #9, merge `d836536`): `apps/api/tests/` มี 63 เทสต์ (bundle, render plan/mix, validate, agent contract, files upload traversal, smoke API) + frontend 111 เทสต์ (vitest) — `test.bat` รันทั้งสองชุดใน CI แล้ว ([release.yml](../../.github/workflows/release.yml)) · ยังไม่ครอบ: dubbing/mastering/music pipeline เอง (มีแต่ smoke script ไม่ใช่ pytest) | Boss |
| R-009 | **ซาก build artifacts ปลอมตัวเป็น monorepo** — สแกน 2026-08-09 พบ `apps/api` มีแต่ `.pyc` 75 ไฟล์ (ไม่มี `.py` เลย), `apps/mcp` มีแต่ dist/node_modules, `apps/desktop` มีแต่ src-tauri bundle ~55k ไฟล์ — เสี่ยงคน/agent เข้าใจผิดว่าเป็น source จริงแล้วไปแก้ผิดที่ | L | — | ✅ **RESOLVED 2026-08-19** (PR #9): monorepo ย้ายเป็นของจริงแล้ว — `backend/`+`frontend/` (flat) ย้ายเข้า `apps/api/`+`apps/desktop/` จริง พร้อม `apps/mcp/`+`packages/contracts/` ใหม่, ถอดบล็อก `apps/`+`packages/` ออกจาก .gitignore ตามที่คอมเมนต์เดิมเตือนไว้ · **source of truth ปัจจุบัน = `apps/` + `packages/`** (ไม่ใช่ `backend/`/`frontend/` อีกต่อไป) · `backend/.venv` ย้ายไป `apps/api/.venv` สำเร็จแล้ว (2026-08-19 — ล็อกไฟล์ตอนแรกหายไปเอง หลัง retry) — พบผลข้างเคียงที่ควรรู้: ย้าย venv แบบนี้ทำให้ pip console-script wrapper exe (`Scripts\pyinstaller.exe` ฯลฯ) พังเงียบ ๆ เพราะ path ที่ฝังไว้ตอนติดตั้งอ้างที่เดิม — แก้แล้วโดยเรียกผ่าน `python -m PyInstaller` แทนใน `tools/build/build_sidecar.ps1` (ทนทานกว่า ไม่พังถ้าย้าย venv อีกในอนาคต) · เศษที่เหลือบนดิสก์เครื่องนี้ (untracked, ไม่กระทบ git): `backend/app/*.py`, `backend/data/`, `frontend/node_modules/`, `frontend/dist/`, `frontend/src-tauri/target/` ฯลฯ ยังอยู่จริงบนดิสก์ (ghosts เหมือนที่ scan 2026-08-09 เจอ แค่กลับด้าน — ตอนนั้น apps/ เป็น ghost, ตอนนี้ backend/frontend เป็น ghost) — ลบได้ปลอดภัยเมื่อ Boss ยืนยัน (`git ls-files backend frontend` ยืนยันว่า git ไม่ track อะไรที่นั่นแล้ว) | Boss |

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect |
| 1.1.0 | 2026-08-09 | Boss | R-009: reframe เป็น artifact ghosts (จากผลสแกน) → **MITIGATED** ด้วย .gitignore (commit 389e346), โอกาส H→L |
