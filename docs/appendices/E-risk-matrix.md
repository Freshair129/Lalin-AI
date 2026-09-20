# Appendix E — Risk Matrix

| Field | Value |
|-------|-------|
| **Version** | 1.2.0b |
| **Status** | Beta |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-09-20 |
| **Approved By** | Boss — Phase 1 scope approved 2026-08-23 |

ความน่าจะเป็น/ผลกระทบ: L(ต่ำ) M(กลาง) H(สูง) — ทบทวนทุกครั้งที่จะ release

| ID | ความเสี่ยง | โอกาส | ผลกระทบ | การจัดการ | เจ้าของ |
|---|---|---|---|---|---|
| R-001 | **GPL contamination** — matchering/pedalboard/parselmouth ติด GPL ถ้า bundle ขาย | H (ถ้าไม่จัดการ) | H — โมเดลธุรกิจพัง | BR-002: แยกเป็น optional plugin/BYOM ไม่ bundle ใน core ([AI-ETH-003](../ai-system/ethics-governance.md)) | Boss |
| R-002 | **XTTS v2 = CPML non-commercial** หลุดเข้า installer ขาย | M | H | ไม่ bundle · fallback ไทยเป็น F5 อยู่แล้ว (FR-02.5) · ตรวจ manifest ก่อน build | Boss |
| R-003 | **Voice clone misuse** (ปลอมเสียงหลอกลวง) กระทบชื่อเสียง/กฎหมาย | M | H | AI-ETH-001/002: consent checkbox + terms + พิจารณา watermark | Boss |
| R-004 | **VRAM 12GB ไม่พอ** เมื่อ pipeline ซ้อนกัน (dubbing+brain / remix) | M | M | 🟡 **PARTIAL 2026-08-23 (G-07)**: CUDA jobs เข้า FIFO concurrency 1, CPU jobs bypass, cleanup กลางหลัง terminal และมี configurable `gpu_min_free_mb` probe พร้อม automated concurrency/wait/cleanup tests; แต่ threshold ยัง `0` เพราะยังไม่มี peak measurement และยังไม่ได้รัน Dubbing+Remix concurrent-submit บน RTX 3060 จริง จึงยังไม่ MITIGATED ([model-lifecycle](../ai-system/model-lifecycle.md) §2) | Boss |
| R-005 | **Model repo บน HF หาย/เปลี่ยน** (F5-TTS-THAI ckpt) | L | H | pin ckpt · ✏️ TODO mirror ckpt สำรอง (S3/local) + checksum | Boss |
| R-006 | **Sidecar packaging ยังไม่เคย build จริง** — เอกสารระบุ SCAFFOLDING เท่านั้น | M (เดิม H) | M — block การ ship | 🟡 **PARTIAL 2026-08-19/23**: build จาก `frontend`/`backend` เดิม (ก่อน PR #9) verified จริงตอน Phase D — แต่หลัง PR #9 ย้ายเข้า `apps/` **sidecar พังจริง ๆ** โดยไม่มีใครรู้: `collect_submodules("app")` ใน `.spec` รันก่อน PyInstaller ใส่ `pathex` ทำให้ `apps/api` ไม่อยู่บน sys.path ตอนนั้น → ทั้ง package `app` (รวม FastAPI/pydantic) ไม่ถูก bundle เลย — build "สำเร็จ" แต่ exe crash ทันทีตอนเปิดด้วย `ModuleNotFoundError` (จะพังที่แถว 2 ของ checklist แน่นอนถ้าไม่เจอ) แก้แล้ว 2026-08-23 (ดู commit `c885c04`) — build จริง+bundle 237MB+`/health` ตอบ 200 จริง verified ด้วยมือหลายรอบ (ไม่ใช่ผ่านสคริปต์อัตโนมัติ — smoke-test gate ในสคริปต์เองไม่เสถียรเฉพาะใน session debug นี้ ดู commit message) — ยังขาด: รัน [CLEAN_VM_CHECKLIST.md](../operations/CLEAN_VM_CHECKLIST.md) ครบ 9 แถวบนเครื่องที่ไม่มี dev toolchain จริง ๆ ก่อนจะปิดเป็น MITIGATED | Boss |
| R-007 | **GGUF/chat-template เสีย** ใน local model (เคยเจอ: gemma-4-12B คืน token รั่ว) | M | L | Verify Gate + ban list ใน [LOCAL_MODEL_LEDGER.md](../LOCAL_MODEL_LEDGER.md) | Boss |
| R-008 | **Backend ไม่มีเทสต์อัตโนมัติ** — regression เงียบใน pipeline | L (เดิม H) | M | ✅ **MITIGATED 2026-08-19** (PR #9, merge `d836536`): `apps/api/tests/` มี 63 เทสต์ (bundle, render plan/mix, validate, agent contract, files upload traversal, smoke API) + frontend 111 เทสต์ (vitest) — `test.bat` รันทั้งสองชุดใน CI แล้ว ([release.yml](../../.github/workflows/release.yml)) · ยังไม่ครอบ: dubbing/mastering/music pipeline เอง (มีแต่ smoke script ไม่ใช่ pytest) | Boss |
| R-009 | **ซาก build artifacts ปลอมตัวเป็น monorepo** — สแกน 2026-08-09 พบ `apps/api` มีแต่ `.pyc` 75 ไฟล์ (ไม่มี `.py` เลย), `apps/mcp` มีแต่ dist/node_modules, `apps/desktop` มีแต่ src-tauri bundle ~55k ไฟล์ — เสี่ยงคน/agent เข้าใจผิดว่าเป็น source จริงแล้วไปแก้ผิดที่ | L | — | ✅ **RESOLVED 2026-08-19** (PR #9): monorepo ย้ายเป็นของจริงแล้ว — `backend/`+`frontend/` (flat) ย้ายเข้า `apps/api/`+`apps/desktop/` จริง พร้อม `apps/mcp/`+`packages/contracts/` ใหม่, ถอดบล็อก `apps/`+`packages/` ออกจาก .gitignore ตามที่คอมเมนต์เดิมเตือนไว้ · **source of truth ปัจจุบัน = `apps/` + `packages/`** (ไม่ใช่ `backend/`/`frontend/` อีกต่อไป) · `backend/.venv` ย้ายไป `apps/api/.venv` สำเร็จแล้ว (2026-08-19 — ล็อกไฟล์ตอนแรกหายไปเอง หลัง retry) — พบผลข้างเคียงที่ควรรู้: ย้าย venv แบบนี้ทำให้ pip console-script wrapper exe (`Scripts\pyinstaller.exe` ฯลฯ) พังเงียบ ๆ เพราะ path ที่ฝังไว้ตอนติดตั้งอ้างที่เดิม — แก้แล้วโดยเรียกผ่าน `python -m PyInstaller` แทนใน `tools/build/build_sidecar.ps1` (ทนทานกว่า ไม่พังถ้าย้าย venv อีกในอนาคต) · เศษที่เหลือบนดิสก์เครื่องนี้ (untracked, ไม่กระทบ git): `backend/app/*.py`, `backend/data/`, `frontend/node_modules/`, `frontend/dist/`, `frontend/src-tauri/target/` ฯลฯ ยังอยู่จริงบนดิสก์ (ghosts เหมือนที่ scan 2026-08-09 เจอ แค่กลับด้าน — ตอนนั้น apps/ เป็น ghost, ตอนนี้ backend/frontend เป็น ghost) — ลบได้ปลอดภัยเมื่อ Boss ยืนยัน (`git ls-files backend frontend` ยืนยันว่า git ไม่ track อะไรที่นั่นแล้ว) | Boss |
| R-010 | **TTS model license ไม่ชัด** — `VIZINTZOR/F5-TTS-THAI` ติด tag CC-BY-4.0 แต่เป็น finetune ของ `SWivid/F5-TTS` ซึ่งผู้เขียนประกาศ weights เป็น **CC BY-NC-4.0** (เพราะข้อมูล Emilia) และ dataset ไทยหลัก `Porameht/processed-voice-th-169k` เป็น **CC BY-SA-4.0**; model card เดิมบันทึกเฉพาะ tag ของผู้ finetune จึงระบุ "commercial OK" เกินหลักฐาน · candidate ทางเลือก `JTS-AI/JaiTTS-F5TTS` ไม่มี repo public (404, ตรวจ 2026-09-20) | M | H — กระทบทั้ง installer ที่ขายและ PRP voice worker (LVP-REQ-008 / D9) | 🔴 **OPEN 2026-09-20**: บันทึกข้อเท็จจริงใน [model card](../ai-system/model-cards/f5-tts-thai.md) และ [JAITTS_EASY_COMPARISON §2.2](../architecture/JAITTS_EASY_COMPARISON.md); rights owner ต้องตัดสิน (ขอความชัดเจนจากผู้เผยแพร่/ที่ปรึกษากฎหมาย) ก่อนอนุมัติ TTS profile ใด ๆ ใน CR-005 Slice B และก่อนอ้าง "commercial OK" ในเอกสารใหม่; ทางเลือกถ้า NC: ใช้เฉพาะ non-commercial/internal หรือหาโมเดลไทยที่ base ไม่ใช่ NC | Boss |

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect |
| 1.1.0 | 2026-08-09 | Boss | R-009: reframe เป็น artifact ghosts (จากผลสแกน) → **MITIGATED** ด้วย .gitignore (commit 389e346), โอกาส H→L |
| 1.1.1b | 2026-08-23 | LALIN | บันทึก G-07 automated admission evidence ใน R-004 โดยคง risk เปิดจนกว่าจะมี measured VRAM/manual RTX gate |
| 1.2.0b | 2026-09-20 | LALIN | เพิ่ม R-010 TTS model license (base CC BY-NC / dataset CC BY-SA) จากการตรวจ HF/GitHub; สถานะ OPEN รอ rights owner |
