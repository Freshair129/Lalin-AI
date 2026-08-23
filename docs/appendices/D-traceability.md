# Appendix D — Traceability Matrix

| Field | Value |
|-------|-------|
| **Version** | 1.3.1b |
| **Status** | Beta |
| **Author** | Boss |
| **Created** | 2026-08-09 |
| **Last Updated** | 2026-08-23 |
| **Approved By** | Boss — Phase 1 scope approved 2026-08-23 |

โยง requirement ([SRS.md](../product/SRS.md)) ↔ design ↔ โค้ด ↔ เทสต์ — แถวไหน Test ว่าง = ช่องโหว่ coverage ที่รู้ตัว

## Functional Requirements

| Req | ชื่อ | Design | Code (หลัก) | Test | สถานะ |
|---|---|---|---|---|---|
| FR-01 | Voice Library | SPEC · BLUEPRINT§views.voices | `app/services/voices.py` + `routers/voices.py` | ✏️ TODO | ✅ done |
| FR-02 | TTS + Voice Cloning | SPEC · BLUEPRINT§models.tts | `app/pipelines/tts.py` + `routers/tts.py` | `smoke_tts.py` (manual) | ✅ done |
| FR-03 | AI Dubbing | SPEC · BLUEPRINT§views.dubbing | `app/pipelines/asr.py`, `dubbing.py` | ✏️ TODO — e2e ยังไม่ได้รัน | ⚠️ รอ e2e |
| FR-04 | Audio Mastering | SPEC · BLUEPRINT§views.mastering | `app/pipelines/mastering.py` | ✏️ TODO | ✅ done |
| FR-04b | Music Remix | ROADMAP_MUSIC · BLUEPRINT§views.remix | `app/pipelines/music.py` + `routers/music.py` | PoC ผ่าน (manual) | backend ✅ / UI กำลังทำ |
| FR-05 | Brain / LLM | SPEC · BLUEPRINT§stack.llm | `app/brain/*` + `routers/brain.py` | ✏️ TODO | ✅ done |
| FR-06 | Job System | SPEC §4 · API_SEMANTICS | `app/jobs/*` + `routers/jobs.py` + `useJob.ts` | `test_job_continuity.py` · `test_gpu_admission.py` · `useJob.test.tsx` | 🟡 automated done / restart manual gate open |
| FR-07 | File Management | SPEC | `routers/files.py`, `fs.py` | ✏️ TODO | ✅ done |
| FR-08 | Auto-Update | SPEC · PACKAGING_SIDECAR | Tauri updater + `.github/workflows/release.yml` | ✏️ TODO — ทดสอบ update จริง | ⚠️ รอ validate |
| FR-09 | Workspace/Timeline | UI_SITEMAP§2-3 · SWARM_PLAN W2.1-2.2/3.2-3.4 | `apps/desktop/src/timeline/*` + ClipTimeline, StudioDock, StemMixer, FxRack | `grid.test.ts` · `ops.test.ts` · `useClipEngine.test.ts` | ✅ done |
| FR-10 | Projects | SWARM_PLAN W0.2/0.6 · A-api-spec (✏️) | `routers/projects.py` + `hooks/useProjectFile.ts` | ✏️ TODO | ✅ done |
| FR-11 | Plugin Manager + Marketplace | SWARM_PLAN W3.6/5.1 · ROADMAP_MUSIC (BYOM) | `routers/plugins.py` + `packs.py`, PluginsPanel, MarketplacePanel | ✏️ TODO | ✅ / packs ยัง mock in-memory |
| FR-12 | Mic Recording | SWARM_PLAN W3.1 | `MicRecorder.tsx` + ปุ่มอัดใน ClipTimeline | ✏️ TODO | ✅ / FR-12.6 (ref voice) ยังไม่ทำ |
| FR-13 | Batch Queue | SWARM_PLAN W3.5 · SPEC §4 | `useBatchQueue.ts` + `BatchQueue.tsx` | `useBatchQueue.test.tsx` | ✅ persist/re-attach/interrupted/queued |
| FR-14 | Workspace Agent + Mix Copilot | ai-system/agent-architecture (AI-AGT-001) · SWARM_PLAN W4.1-4.3 | `routers/agent.py` + `MixCopilot.tsx` | ✏️ TODO | ✅ done |
| FR-15 | File Manager | UI_SITEMAP§3 (files) | `routers/fs.py` + `FileManager.tsx` | ✏️ TODO | ✅ done |

## Non-Functional Requirements

| Req | ชื่อ | ตรวจด้วย | สถานะ |
|---|---|---|---|
| NFR-01 | ประสิทธิภาพ | ตัวเลขวัดจริง: TTS ~9s / Ollama warm ~2s — ✏️ TODO เก็บเป็น benchmark ซ้ำได้ | ⚠️ |
| NFR-02 | ความเชื่อถือได้ | lazy import + CPU fallback + durable jobs + GPU FIFO: `test_runtime_devices.py`, `test_job_continuity.py`, `test_gpu_admission.py` | 🟡 automated green / CPU-TTS + RTX3060 manual gates open |
| NFR-03 | ความปลอดภัย | API key masked · keys/ gitignored · ✏️ TODO ทบทวน SEC-xxx เป็นรายการ | ⚠️ |
| NFR-04 | ความสามารถในการใช้งาน | UI ไทย + JobProgress ทุกงานยาว | ✅ |
| NFR-05 | Portability | Windows x64 เท่านั้น (v0.1 by design) | ✅ |
| NFR-06 | Maintainability | brain provider ผ่าน interface เดียว · docs ชุดนี้ | ✅ |

## ช่องโหว่ที่เห็นจาก matrix

1. **เทสต์อัตโนมัติฝั่ง backend มีแล้ว 63 ตัว** (PR #9) แต่ยังกระจุกที่ `render/bundle/agent/files` — pipeline หลัก (tts/dubbing/mastering/music) ยังพึ่ง manual/PoC smoke script ไม่ใช่ pytest จริง
2. Dubbing e2e (FR-03) + Auto-update (FR-08) ยังไม่เคย validate จริง — ตรงกับสถานะใน README/PACKAGING_SIDECAR
3. FR-09 (timeline) + FR-07 (files) + FR-10 (projects) + FR-14 (agent) มีเทสต์แล้ว — `plugins`/`packs`/`fs` routers ยังไม่มีเทสต์เลย

## ผลสแกน doc-graph (อัตโนมัติ)

> สแกนล่าสุด 2026-08-19 (หลัง PR #9 ย้ายเข้า `apps/`) โดย `tools/doc_graph_scan.py` — รันซ้ำ: `apps/api/.venv/Scripts/python.exe tools/doc_graph_scan.py` (fallback `backend/.venv` ถ้ายังไม่ย้าย)

| Metric | ค่า | เป้า |
|---|---|---|
| Requirements ↔ code (annotation `@req` จริงในโค้ด) | **69% (25/36)** | 50%+ ✅ |
| Requirements ↔ tests (verifies) | **13% (5/36)** — PR #9 เพิ่ม FR-07 (upload), FR-10 (projects/bundle), FR-14 (agent) เข้ามา | 90% |
| Code files ที่เอกสารอ้างถึง | 1% (1/85) | 80% |
| Code files ที่มีเทสต์ | **8% (7/85)** — apps/api/tests/ 8 ไฟล์ (63 เทสต์) + apps/desktop 8 ไฟล์ (111 เทสต์) นับตาม pairing ชื่อไฟล์ ไม่ใช่ % ของ pipeline โค้ดจริง — pipelines (tts/dubbing/mastering/music) ยังมีแต่ smoke script | — |
| endpoints ที่สแกนพบ vs BLUEPRINT.yaml | 45 พบ, 45 มีใน blueprint, **0 ขาด** (ปิดแล้ว 2026-08-19 — เพิ่ม /render, /projects/{pid}/bundle, /projects/import) | 0 ขาด |

**หมายเหตุ:** annotation migration **เสร็จแล้ว** (2026-08-09) — `@req/@spec` ครบ 44 ไฟล์ (backend 26 + frontend 18, รวม 55 จุด) ครอบคลุม FR-01..15 ทุกตัว → matrix นี้ตรวจ drift อัตโนมัติได้ตั้งแต่รอบนี้ · verifies ไม่ต้องใช้ `@tested`: scanner โยง test → code (คู่ชื่อไฟล์) → requirement ให้อัตโนมัติ (ตอนนี้ได้ 5/36 (FR-07, FR-09, FR-10, FR-14 และอีก 1 ตัว — ดูตาราง Requirements ↔ tests ด้านบน) — mermaid ด้านล่างวาดไว้ตอน FR-09 ตัวเดียว ยังไม่ได้อัปเดตตามรอบสแกนนี้) · 14 requirements ที่ไม่มี implements เป็นเชิงนโยบาย/เอกสาร (NFR-01/03/04, AI-AGT-002..005, AI-ETH-001/002/004, BR-001, DR-xxx) — ปกติสำหรับ requirement ประเภทนี้

### Reverse gap — โค้ดมีแล้วแต่ "ไม่มี requirement" (✅ ปิดแล้ว 2026-08-09)

สแกนพบ **26 components + 21 endpoints** จาก Wave 2-5 ที่ SRS ยังไม่มี FR รองรับ — **เขียนเป็น FR-09..FR-15 ใน [SRS v1.1.0](../product/SRS.md) แล้ว** (แถว traceability อยู่ในตารางหลักข้างบน):

| FR | ฟีเจอร์ | โค้ดที่มีแล้ว |
|---|---|---|
| FR-09 | Workspace/Timeline (DAW floor + clips) | `apps/desktop/src/timeline/*` (**มีเทสต์แล้ว 3 ไฟล์**), Timeline, ClipTimeline, StudioDock, StemMixer, FxRack |
| FR-10 | Projects | `routers/projects.py` (5 endpoints), useProjectFile.ts |
| FR-11 | Plugin Manager + Marketplace + Packs | `routers/plugins.py` + `packs.py` (5 endpoints), PluginsPanel, MarketplacePanel |
| FR-12 | Mic Recording | MicRecorder.tsx |
| FR-13 | Batch Queue | useBatchQueue.ts, BatchQueue.tsx |
| FR-14 | Workspace Agent + Mix Copilot | `routers/agent.py` (`POST /agent/act`), MixCopilot.tsx — ผูกกับ AI-AGT-001 |
| FR-15 | File Manager | `routers/fs.py` (6 endpoints), FileManager.tsx |

### แผนภาพ (ตัดเฉพาะแกนหลัก)

```mermaid
graph LR
    subgraph SRS
        FR02[FR-02 TTS/Clone]
        FR03[FR-03 Dubbing]
        FR04b[FR-04b Remix]
        FR09[FR-09 Workspace/Timeline]
    end
    subgraph Code
        TTS[pipelines/tts.py]
        DUB[pipelines/dubbing.py]
        MUS[pipelines/music.py]
        TL[timeline/grid.ts ops.ts useClipEngine.ts]
    end
    subgraph Tests
        T[grid.test.ts ops.test.ts useClipEngine.test.ts]
    end
    TTS -->|"@req"| FR02
    DUB -->|"@req"| FR03
    MUS -->|"@req"| FR04b
    T -->|tests| TL
    T -->|verifies| FR09
    TL -->|"@req"| FR09
    style FR09 fill:#14A88A,color:#fff
```

ทุกเส้น = ตรวจพบจากสแกนจริง (annotation `@req` ในโค้ด · test คู่ชื่อไฟล์ · verifies ที่ scanner โยงให้)

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-08-09 | Boss | สร้างผ่าน rwang:doc-architect |
| 1.1.0 | 2026-08-09 | Boss | เพิ่มผลสแกน doc-graph + reverse gap (FR-09..15 เสนอ) + mermaid |
| 1.2.0 | 2026-08-09 | Boss | ปิด reverse gap (FR-09..15 เข้า SRS v1.1.0 + แถวในตาราง FR) · annotation `@req` ลงโค้ด 44 ไฟล์ → coverage 61%, verifies FR-09 |
| 1.3.0 | 2026-08-19 | Boss | สแกนใหม่หลัง PR #9 (monorepo migration เข้า apps/) — path ref backend/frontend -> apps/api/apps/desktop, coverage 61%->69% @req / 2%->13% verifies / 3%->8% files-with-tests, endpoint scan 45 (3 ขาดจาก BLUEPRINT.yaml) |
| 1.3.1b | 2026-08-23 | LALIN | เพิ่ม automated evidence ของ G-09/G-06/G-07 และแยก manual CPU/RTX/clean-VM gates ที่ยังเปิด |
