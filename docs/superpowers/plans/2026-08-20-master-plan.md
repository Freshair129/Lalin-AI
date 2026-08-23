# Master Plan — หลัง PR #9 (2026-08-20)

> สถานะตั้งต้น: PR #9 merge เข้า `swarm/local-llm-refine` แล้ว (`d836536`) — Phase A–D ของ
> audit + G-05/G-10 ปิดหมด (pytest 63 · vitest 111 · tsc/cargo clean). เอกสารนี้รวบ
> **ทุกงานที่ยังค้าง** จาก 4 แหล่ง: (1) หางของ PR #9, (2) gap register G-06..G-13,
> (3) E-risk matrix, (4) ROADMAP_EXECUTION_BACKLOG — จัดเป็น phase ตาม dependency
> หลักจัดลำดับเดียวกับ backlog: ใกล้ของเดิม → unlock งานอื่น → verify ง่าย → เสี่ยงต่ำ

## ภาพรวม

| Phase | ชื่อ | ปิดอะไร | ขนาด | ขึ้นกับ |
|---|---|---|---|---|
| 0 | ปิดหาง PR #9 + repo hygiene | R-006, R-008, R-009 ขั้นสุดท้าย, stale paths | S | — |
| 1 | Runtime robustness (G-09 → G-06 → G-07) | ใช้ได้จริงบนเครื่องไม่มี GPU · job ไม่หายเมื่อปิดแอป · ไม่ OOM | M | 0 |
| 2 | Signal-path parity + content (G-08, G-13) | export = preview จริง · Library มีไฟล์จริง | M | 1 (G-06 สำหรับ render job) |
| 3 | Track A — Dubbing Pro (Slice A→B→C) | PRD v0.3 multi-speaker dubbing | L | 1 |
| 4 | Track B — Music Phase C (B1→B2→B3) | pyworld / beat-warp / RVC | L | 2, 3 |
| 5 | Track C — Platform (C1→C2→C3) | macOS/Linux · plugin system · fine-tuning | XL | 4 |

กฎเดิมทุก task: **TDD** (เทสต์แดงก่อน → เขียว → commit) · งานยาวผ่าน `jobs.spawn()` + WebSocket ·
commit message บอก root cause + สิ่งที่เจอระหว่างทำ + ตัวเลขเทสต์ก่อน/หลัง · **ห้ามอ้าง verify ที่ไม่ได้ทำ**

---

## Phase 0 — ปิดหาง PR #9 + repo hygiene (S)

เป้า: สิ่งที่ merge ไปแล้ว "ถือว่าใช้ได้" จริง ไม่ใช่แค่เทสต์ผ่าน และทำให้ repo พูดความจริงหลัง monorepo migration

| # | งาน | Done เมื่อ |
|---|---|---|
| 0.1 | **Rebuild installer จาก `apps/desktop`** — ตัวที่มีตอนนี้ build จาก `frontend/` ก่อน merge (ไม่มี Lalin shell / lite-full profile) — ใช้ `tools/build/build_sidecar.ps1 -Profile full` แล้ว `npm run tauri build` ใน apps/desktop | ได้ `.exe` ใหม่ + smoke test `/health` ผ่านในสคริปต์ |
| 0.2 | **Updater signing** — ตั้ง `TAURI_SIGNING_PRIVATE_KEY` จาก `keys/g-music.key` ใน `tools/build/build_installer.ps1` (อ่านไฟล์ → env var ตอนรัน ไม่ commit key) | `tauri build` exit 0 ทั้งสาย, ได้ `.sig` ข้าง installer |
| 0.3 | **Task 18 clean-VM checklist** — ผู้ใช้รันเอง 9 แถวตาม `docs/operations/CLEAN_VM_CHECKLIST.md` (ส่ง installer ไป shared folder เมื่อได้ path) | ทุกแถว pass → แก้ `E-risk-matrix.md` R-006 = MITIGATED (แบบ R-009) + ถอด banner SCAFFOLDING ใน `docs/operations/PACKAGING_SIDECAR.md` |
| 0.4 | **R-008 ปิด** — backend มีเทสต์แล้ว 63 ตัว: อัปเดต risk matrix + `D-traceability.md` ให้ชี้ `apps/api/tests/` | risk row ระบุ commit + ตัวเลข |
| 0.5 | **R-009 ขั้นสุดท้าย** — monorepo เป็นของจริงแล้ว: อัปเดต row ให้บอกว่า source of truth = `apps/` (ไม่ใช่ backend/+frontend/ อีกต่อไป); ลบ `frontend/.playwright-cli/*.png` ที่ค้างใน git; ลบโฟลเดอร์ `backend/` `frontend/` บนดิสก์หลังย้าย `.venv` → `apps/api/.venv` | `git ls-files backend frontend` ว่าง |
| 0.6 | **Stale paths** — `CLAUDE.md` (ยังพูดถึง `backend/` `frontend/` `D:\G-Music`), root `package.json` `check:api` ชี้ `backend/.venv` | grep ไม่เจอ `backend/` `frontend/` ในไฟล์ config/คู่มือ |
| 0.7 | **CI ตรวจจริง** — push tag ทดสอบ (`v0.1.0-rc1`) ให้ `release.yml` รันครบ: contracts→mcp→desktop build, sidecar build, vitest, pytest, tauri-action + signing จาก secret | workflow เขียว 1 รอบ |

**Exit gate Phase 0:** installer ที่ build จาก `apps/` ผ่าน clean-VM ครบ 9 แถว, CI เขียว, risk matrix ไม่มี row ที่ "ยังไม่เคย build จริง"

---

## Phase 1 — Runtime robustness: G-09 → G-06 → G-07 (M)

ลำดับนี้ตรง dependency จาก audit: G-07 ต้องมีคิวของ G-06 ก่อน; G-09 อิสระแต่ทำก่อนเพราะ lite installer ไร้ค่าบนเครื่องไม่มี GPU

> **Execution status 2026-08-23:** implementation + automated tests ลงแล้ว (backend 82,
> frontend 118 ณ verification รอบนี้) แต่ Phase 1 ยังไม่ผ่าน exit gate: CPU-only TTS smoke,
> restart ระหว่างงานจริง, peak VRAM/Dubbing+Remix บน RTX 3060 และ clean-VM 9 แถวยังเป็น
> manual/external gates; R-004/R-006 จึงยังเปิด

### 1.1 G-09 CPU fallback
- `config.py`: `tts_device`/`asr_device` = `"auto"` → resolve เป็น cuda ถ้า `torch.cuda.is_available()` ไม่งั้น cpu; ASR compute_type ตามอุปกรณ์ (`int8` บน CPU)
- `/runtime/status` รายงาน `device` ที่ใช้จริง; UI (RuntimeFooter) แสดง
- ข้อความเตือนไทยเมื่อ fallback ("ไม่พบ GPU — ใช้ CPU จะช้ากว่า ~N เท่า")
- เทสต์: monkeypatch `cuda.is_available=False` → settings resolve เป็น cpu, endpoint ตอบ `device: cpu`
- **Done:** รัน TTS 1 ประโยคบนเครื่องที่ set `CUDA_VISIBLE_DEVICES=""` สำเร็จ

### 1.2 G-06 Job continuity
- ตอนนี้ `jobs/manager.py` เก็บ in-memory → ปิดแอป = งานหาย, reconnect WS ไม่ได้
- persist job table ลง `data_dir/jobs.json` (หรือ sqlite): id/kind/status/progress/result/error/created
- boot: โหลดกลับ, งานที่ `running` ตอนตาย → mark `interrupted` (ไม่ resume เองเพราะ pipeline ไม่ idempotent)
- `GET /jobs` คืนประวัติ, WS `/jobs/{id}/ws` subscribe งานที่มีอยู่แล้วได้ (replay สถานะล่าสุดทันที)
- Frontend `useJob`/`BatchQueue`: re-attach หลัง reload ด้วย id ที่เก็บใน localStorage
- เทสต์: spawn → serialize → สร้าง manager ใหม่จากไฟล์ → สถานะคงอยู่; running→interrupted
- **Done:** ปิด-เปิดแอประหว่าง render แล้วแท็บ Jobs ยังเห็นงานพร้อมสถานะ interrupted

### 1.3 G-07 GPU admission control
- คิวเดียวสำหรับงาน GPU-heavy (tts/dubbing/remix/render-with-FX): `asyncio.Semaphore(1)` ใน manager + สถานะ `queued` ให้ UI เห็นลำดับ
- `torch.cuda.empty_cache()` หลังทุก job (ตอนนี้มีแค่ใน music.py)
- ถ้า VRAM ว่าง < threshold ก่อนเริ่ม → รอ ไม่ใช่ OOM กลางทาง; R-004 อ้างถึงข้อนี้
- เทสต์: spawn 3 งาน GPU พร้อมกัน → รันทีละงาน, ลำดับคิวถูกต้อง, งาน CPU-only ไม่ถูกบล็อก
- **Done:** dubbing + remix พร้อมกันบน 3060 12GB ไม่ OOM; R-004 mitigated

**Exit gate Phase 1:** เทสต์ทั้งสาม green ใน CI; risk matrix R-004 mitigated; `docs/architecture/API_SEMANTICS.md` อัปเดต job lifecycle

---

## Phase 2 — Parity + content: G-08, G-13 (M)

### 2.1 G-08 Master-FX preview/render parity
ปัญหาจาก audit: preview ใช้ Web Audio (`DynamicsCompressor` lookahead ไม่ระบุ, reverb IR สุ่มต่อ session) ส่วน render ใช้ pedalboard → เสียงต่างกันและพิสูจน์ไม่ได้
- เขียน **canonical FX spec** (`docs/architecture/FX_SPEC.md`): reverb = convolution กับ IR ไฟล์คงที่ที่ ship ใน assets; compressor = พารามิเตอร์ชุดเดียว (threshold/ratio/attack/release/knee) ไม่ใช้ lookahead; echo = delay+feedback ตรง ๆ
- Frontend: แทน `ConvolverNode` IR สุ่ม ด้วย IR ไฟล์เดียวกับ backend; compressor ใช้ `DynamicsCompressorNode` แต่ระบุทุก param
- Backend: implement spec เดียวกันใน numpy/scipy (**ไม่พึ่ง pedalboard** ให้ core path — pedalboard เหลือเป็น plugin เสริมตาม R-001)
- เทสต์ golden: render 1 วิ sine + FX แต่ละตัว เทียบกับ reference ที่คำนวณจาก spec ≤ −60 dBFS
- **Done:** A/B preview vs export ด้วย null test ต่างกัน < −40 dBFS (ยอมรับความต่าง float ของ browser)

### 2.2 G-13 Library/Marketplace ไฟล์จริง
- `packs.py` เลิก mock: catalog มี `url` + `sha256`, `POST /packs/{id}/download` เป็น job ดาวน์โหลดลง `data_dir/packs/<id>/` แล้วคืนรายการไฟล์
- `LibraryPanel` drag payload ชี้ `{kind:"pack", name:"<id>/<file>"}`; `bundle.resolve_asset` รองรับ kind `pack`
- ลบ `TODO(G-13)` + เทสต์ download job + resolve + bundle export รวมไฟล์ pack
- Pack ชุดแรก: ใช้ไฟล์ CC0 (ระบุ license ใน catalog) — ไม่แตะ R-001/R-002
- **Done:** ลาก loop จาก Library → timeline เล่นได้ → export .gmp → import เครื่องอื่น (เทสต์ bundle round-trip ครอบ)

**Exit gate Phase 2:** audit gap register ไม่เหลือ G-xx ที่ open; `ROADMAP_MUSIC.md` อัปเดต "FX parity achieved"

---

## Phase 3 — Track A: Dubbing Pro (L)

ตาม `ROADMAP_EXECUTION_BACKLOG.md` (next) — proposal Slice A พร้อมแล้วใน `docs/archive/PROPOSED_V03_DUBBING_PRO*.md`

| Slice | งาน | ขึ้นกับ |
|---|---|---|
| **A** (proposal ready) | `POST /dubbing/analyze` (ASR → segments + language + speaker-count heuristic) เป็น job · Transcript tab UI (แก้ข้อความ/เวลาต่อบรรทัด, stale marker เมื่อ source เปลี่ยน) · sync SRS FR-03.x | Phase 1 (G-06 เพราะ analyze เป็น job ยาว) |
| **B** (not approved) | speaker diarization (pyannote หรือ heuristic จาก ASR) → label · mapping speaker→voice profile (ใช้ consent gate ที่มีแล้ว) · `DubbingRequest` รับ `voice_map` · render หลายเสียง | A |
| **C** (not approved) | export clip จาก transcript range · short voice-over จากบรรทัดที่เลือก ลง timeline เป็น asset | A, B |

ขั้นตอนต่อ slice: brainstorm → design doc → **approve** (Slice B/C ยังไม่ approve — ต้องให้ Boss เคาะก่อน) → plan → TDD
**Exit gate:** PRD v0.3.0 ข้อ 3 (multi-speaker dubbing) ปิด; `smoke_dubbing.py` ครอบหลายเสียง

---

## Phase 4 — Track B: Music Phase C (L)

| Slice | งาน | ความเสี่ยง |
|---|---|---|
| **B1** pyworld formant-preserving | benchmark vs psola บน pitch shift ±7 semitone · threshold ยอมรับ · สลับ path เมื่อ shift ใหญ่ | pyworld license (MIT) ✓ — ลด dependency GPL psola ได้ด้วย → ช่วย R-001 |
| **B2** piecewise beat-warp | design drift detection · warp map ต่อ segment · timeline preview contract (clip มี `warp: [{src,dst}]`) → schema v4 + `migrateSnapshot` v3→v4 · render.py honor warp | กระทบ project model — ต้องผ่าน round-trip test ของ Phase A |
| **B3** RVC singing conversion | consent gate (มีแล้ว) · BYOM lane ตาม COMPETITIVE_BRIEF · ไม่ bundle weight · legal doc | R-003 (misuse) — ต้องมี watermark/disclaimer ก่อน ship |

**Exit gate:** `ROADMAP_MUSIC.md` Phase C ปิด; ทุก dep ใหม่ระบุ license ใน `C-model-cards.md`

---

## Phase 5 — Track C: Platform (XL, later)

| Slice | งาน |
|---|---|
| **C1** cross-platform audit | รายงาน blocker ต่อ OS: sidecar PyInstaller บน mac/linux, torch wheel, ffmpeg bundle, NSIS→dmg/AppImage; ไม่ implement — แค่ delta report |
| **C2** plugin system | contract (`plugins.py` มีโครง) · sandbox/permission · discovery UX · GPL plugin ทางการ (matchering/pedalboard/psola) ย้ายไปที่นี่ทั้งหมด → ปิด R-001 เด็ดขาด |
| **C3** voice fine-tuning | design only ก่อน: asset storage, consent/data policy (AI-ETH), training job บน G-06 queue |

---

## ลำดับแนะนำทำทันที (2–3 สัปดาห์แรก)

1. **0.1 → 0.2 → 0.7** rebuild + signing + CI เขียว (ทำได้เลย ไม่ต้องรอ)
2. **0.3** clean-VM — รอ path shared folder จาก Boss
3. **0.4–0.6** doc/risk/hygiene — ทำคู่ไประหว่างรอ VM
4. **1.1 G-09** (เล็ก, อิสระ) → **1.2 G-06** → **1.3 G-07**
5. เปิด **Slice A Dubbing Pro** ทันทีที่ G-06 ลง (analyze ต้องเป็น job ที่ไม่หาย)

## สิ่งที่ต้องให้ Boss ตัดสิน
- path shared folder สำหรับ installer (0.3)
- approve Slice B/C ของ Dubbing Pro (Phase 3) — ยังเป็น `not approved`
- ยืนยันลบ `backend/` `frontend/` บนดิสก์ (0.5) — ลบไม่ได้คืน จะถามก่อนลงมือ
