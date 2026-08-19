# SWARM_PLAN.md — แผนปฏิบัติการ Agent Swarm (Refinement เต็มชุด)

> แผนทำงานแบบ autonomous ขนาน อ้างอิงผลวิเคราะห์ refinement (2026-07-02)
> ครอบคลุม: UX/UI เป็น DAW + mobile-ready · lib upgrade · agent ใน workspace · feature ที่ขาด

| Field | Value |
|-------|-------|
| **Doc Version** | 1.0.1 |
| **Status** | Active (dev-time — ไม่ ship ในผลิตภัณฑ์) |
| **Author** | Boss |
| **Created** | 2026-07-02 |
| **Last Updated** | 2026-08-09 |
| **Approved By** | — |

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-07-02 | Boss | ฉบับแรก |
| 1.0.1 | 2026-08-09 | Boss | เพิ่ม Document Control + เข้าระบบ doc-graph — สรุปย่ออยู่ใน ai-system/agent-architecture.md (AI-AGT-004) |

---

## 1. โครงสร้างกำลังพล (Swarm Topology)

```
                    ┌─────────────────────────────┐
                    │  ORCHESTRATOR (Fable 5)      │  คุมคิว wave, แตกงาน, ตัดสินเมื่อ gate ขัดแย้ง
                    └──────────────┬──────────────┘
                                   │ spawn ขนานผ่าน Workflow
        ┌──────────┬───────────────┼───────────────┬──────────┐
        ▼          ▼               ▼               ▼          ▼
   ┌─────────┐┌─────────┐    ┌─────────┐     ┌─────────┐┌─────────┐
   │ WORKER  ││ WORKER  │    │ WORKER  │ ... │ WORKER  ││ WORKER  │   Sonnet 5
   │ (WP-xx) ││ (WP-xx) │    │ (WP-xx) │     │ (WP-xx) ││ (WP-xx) │   isolation: worktree
   └────┬────┘└────┬────┘    └────┬────┘     └────┬────┘└────┬────┘
        ▼          ▼              ▼               ▼          ▼
   ╔═══════════════════════════════════════════════════════════╗
   ║ GATE 1 — STRICT CORRECTNESS REVIEW (Opus, lens: correctness)║  ต่อ 1 WP:
   ║ diff review: bug, type-safety, ผิด requirement, ของหลอก      ║  ผ่าน/ตีกลับ (แก้ได้สูงสุด 2 รอบ)
   ╚═══════════════════════════╦═══════════════════════════════╝
                               ▼
   ╔═══════════════════════════════════════════════════════════╗
   ║ GATE 2 — INTEGRATION + REVIEW (Opus, lens: integration)     ║  ต่อ 1 wave:
   ║ merge worktrees → build + vitest + tsc, ชนกันข้าม WP,        ║  แก้ conflict เอง /
   ║ ความสอดคล้อง UX (token, ภาษาไทย UI, pattern เดียวกัน)        ║  ตีกลับ WP ที่เป็นต้นเหตุ
   ╚═══════════════════════════╦═══════════════════════════════╝
                               ▼
   ╔═══════════════════════════════════════════════════════════╗
   ║ FINAL GATE (Opus 4.8, lens: product)                        ║  ต่อ 1 wave:
   ║ รัน preview จริง → smoke ตาม acceptance criteria ของ wave    ║  อนุมัติ → merge → ปลด wave ถัดไป
   ║ + regression เช็ค flow เดิม (TTS/dub/master ยังทำงาน)        ║  ไม่ผ่าน → รายงาน orchestrator
   ╚═══════════════════════════════════════════════════════════╝
```

**Model mapping (ข้อจำกัดจริง):** subagent เลือกได้เป็นระดับ sonnet/opus/haiku/fable — pin เวอร์ชันย่อย 4.6/4.7 ไม่ได้
| บทบาทที่ขอ | ที่รันจริง | ความต่างอยู่ที่ |
|---|---|---|
| Worker = Sonnet 5 | `sonnet` ✅ | — |
| Gate 1 = Opus 4.6 | `opus` + prompt "strict correctness, effort ต่ำ-กลาง" | lens แคบ เร็ว โหด เรื่องบั๊ก |
| Gate 2 = Opus 4.7 | `opus` + prompt "integration, effort สูง" | merge + build + cross-WP |
| Final = Opus 4.8 | `opus` (= 4.8 จริง) + preview smoke | ตัดสินระดับ product |

**กติกากลาง**
- Worker ทุกตัวทำงานใน **git worktree แยก** — ห้ามแตะไฟล์นอก scope ที่ระบุใน WP
- ทุก WP ต้องจบด้วย `tsc --noEmit` ผ่าน + (ถ้ามีเทสต์) `vitest run` ผ่าน ก่อนส่ง Gate 1
- Gate ตีกลับได้สูงสุด 2 รอบ/WP — รอบที่ 3 escalate ให้ orchestrator ตัดสิน (ทำเอง/ตัดออกจาก wave)
- ห้าม worker แก้ CLAUDE.md, keys/, .github/ และห้าม commit — Gate 2 เป็นคน merge, Final Gate เป็นคนอนุมัติ commit
- UI text ภาษาไทย, identifier อังกฤษ, ตามธีม Cinemaro (ดู CLAUDE.md)

---

## 2. Wave Structure (ลำดับ + dependency)

```
Wave 0 ──► Wave 1 ──► Wave 2 ──► Wave 3 (DAW feats)
 (safety     (foundation) (workspace  ├─ Wave 4 (agent layer)   ← เริ่มพร้อม Wave 3
  net +                    refactor)  └─ Wave 5 (packaging)     ← เริ่มได้ตั้งแต่จบ Wave 1 (backend-only)
  quick wins)
```

---

### WAVE 0 — Safety net + Quick wins (7 WP ขนานทั้งหมด, ไม่มี dependency ระหว่างกัน)

| WP | งาน | ไฟล์หลัก | Acceptance criteria |
|---|---|---|---|
| **0.1** | Vitest + เทสต์ `ops.ts` ครบทุก function (move/slice/clone/delete/gain/mute/toggle/addClip) + `useClipEngine` reorder | `frontend/` (เพิ่ม vitest config), `src/timeline/*` | ≥25 test cases ผ่าน, ครอบ edge (slice นอกช่วง, gain clamp, reorder id ผิด) |
| **0.2** | Modal ในแอปแทน `window.prompt/confirm` ทั้งหมด (Save ชื่อโปรเจกต์, ยืนยันลบ, ยืนยันทิ้ง dirty) | สร้าง `components/Dialog.tsx`, แก้ `useProjectFile.ts`, `RemixPanel.tsx` | ไม่เหลือ `window.prompt|confirm` ใน src/ เลย (grep = 0), ธีมตรง Cinemaro, Esc/Enter ทำงาน |
| **0.3** | PropertiesPanel: wire speed/pitch/fade ให้มีผลจริงกับ clip ที่เลือก หรือถ้า backend ยังไม่รองรับ → ซ่อน control นั้นออก | `PropertiesPanel.tsx`, `useClipEngine.ts`, `ops.ts` | ไม่มี control ที่ขยับแล้วไร้ผลเหลืออยู่ (ป้าย "ยังไม่ส่งผล" หายไปพร้อมเหตุผลใน PR note) |
| **0.4** | Export SRT/VTT จาก dubbing | `backend/app/routers/dubbing.py` (endpoint ใหม่), `DubbingPanel.tsx` (ปุ่มดาวน์โหลด) | dub 1 ไฟล์ → ได้ .srt timestamps ตรง segment, .vtt เปิดใน player ได้ |
| **0.5** | Dubbing คืนวิดีโอเต็มไฟล์ (re-mux เสียงพากย์กลับเข้า container ด้วย ffmpeg ที่ bundle) | `backend/app/pipelines/dubbing.py`, `utils/ffmpeg.py` | input .mp4 → output .mp4 ภาพเดิม+เสียงใหม่, sync ตรง, ไฟล์เสียงเดี่ยวยังได้เหมือนเดิม |
| **0.6** | Autosave: interval 60s เมื่อ dirty → เก็บ draft (`/projects` id พิเศษหรือ localStorage) + recovery banner ตอนเปิดแอปถ้ามี draft ใหม่กว่า save ล่าสุด | `hooks/useProjectFile.ts`, `RemixPanel.tsx` | ฆ่าแอปกลางคัน → เปิดใหม่เจอ banner กู้คืน → กู้แล้ว state ตรง |
| **0.7** | แก้ LUFS drop หลัง FX chain: ใช้ `pedalboard.Limiter` แทน peak-scaling (known issue ใน ROADMAP_MUSIC §known-issues) | `backend/app/pipelines/music.py`, `backend/smoke_remix.py` | remix ออกมา LUFS ±0.5 จาก target, sample peak ≤ -1 dBFS ตาม smoke gate |

**Final Gate Wave 0:** flow เดิมทั้ง 5 แท็บใช้งานได้เหมือนก่อน + ทุก criteria ข้างบน

---

### WAVE 1 — Foundation (3 WP ขนาน, ต้องจบก่อน Wave 2)

| WP | งาน | Acceptance criteria |
|---|---|---|
| **1.1** | **Zustand store**: ย้าย state โปรเจกต์/transport/UI จาก useState กระจัดกระจาย → store เดียว (`src/store/`): `useProjectStore` (project+undo+selection — ห่อ engine เดิม), `useTransportStore` (playing/pos/bpm/loop), `useUiStore` (tab/panel/dialog) โดย **คง API ของ `useClipEngine` เดิมไว้เป็น facade** ให้ component เดิมไม่พังยกแผง | tsc ผ่าน, เทสต์ 0.1 ยังเขียว, RemixPanel เหลือ useState เฉพาะ local UI, ไม่มี prop-drilling engine ลึกเกิน 1 ชั้น |
| **1.2** | **Design tokens + responsive**: แตก styles.css → `styles/tokens.css` (สี/spacing/radius/typography/touch-size) + ไฟล์ต่อ component; กำหนด breakpoint desktop ≥1100 / compact 700–1100 / mobile <700; touch target ≥44px (hit-area ผ่าน pseudo-element ไม่เปลี่ยนหน้าตา desktop); rail→bottom tabs, side panel→bottom sheet, bento→stack ที่ mobile | resize 375px แล้ว: ไม่มี horizontal overflow, nav ใช้ได้, timeline scroll ได้, ปุ่ม M/S/grip กดโดนด้วยนิ้ว (hit ≥44px) |
| **1.3** | **Waveform เหลือระบบเดียว**: ตัด wavesurfer.js ออก → ใช้ SVG peaks (`timeline/peaks.ts`) ทุกที่ (Waveform.tsx, Timeline.tsx) + ปุ่ม play/seek เอง | `npm ls wavesurfer.js` ไม่มีแล้ว, ทุกจุดที่เคยโชว์ waveform ยังโชว์ + คลิก seek ได้, bundle เล็กลง |

**Final Gate Wave 1:** แอปหน้าตา/พฤติกรรมเดิมบน desktop 100% (นี่คือ refactor ไม่ใช่ redesign) + mobile viewport ใช้งานพื้นฐานได้

---

### WAVE 2 — Workspace Refactor: จาก "แท็บฟอร์ม" เป็น DAW จริง (ทำเป็นก้อนเดียว 2 WP ต่อเนื่อง — พื้นที่ชนกันสูง ไม่ขนาน)

| WP | งาน | Acceptance criteria |
|---|---|---|
| **2.1** | **Global transport + workspace shell**: transport bar (play/stop/rec-placeholder/เวลา/BPM/meter/project title+dirty) ขึ้นระดับ App ถาวร; timeline เป็นพื้นกลางถาวร; แท็บเดิม (Voices/TTS/Dubbing/Mastering/Brain/Library) กลายเป็น dock panel ซ้าย/ขวา/ล่าง สลับได้ ไม่บัง timeline | เปิดแอปเห็น timeline+transport ทันที, ทุก panel เดิมเข้าถึงได้ใน ≤2 คลิก, คีย์ลัดเดิมทำงานทุกที่ |
| **2.2** | **ผลลัพธ์เป็น clip**: งาน TTS/Dubbing/Mastering/Remix ที่เสร็จ → เพิ่มเป็น clip ลง track อัตโนมัติ (เลือก track ปลายทางได้, มีปุ่ม "ส่งลง timeline" ใน JobProgress) + ลากไฟล์จาก Library/FileManager ลง lane ได้โดยตรง | สั่ง TTS 1 ประโยค → clip โผล่บน track พร้อม waveform เล่นได้; ลากไฟล์จาก Library ลง lane ว่าง → เกิด clip; undo ได้ |

**Final Gate Wave 2:** ผู้ใช้ใหม่เปิดแอปแล้วอ่านออกทันทีว่า "นี่คือโปรแกรมทำเพลง" — วัดโดย: ทำ workflow "อัปโหลด beat → TTS ประโยคหนึ่ง → ทั้งคู่เป็น clip → mix → export" จบโดยไม่ออกจากหน้า workspace เลย

---

### WAVE 3 — DAW Features (6 WP ขนาน หลัง Wave 2)

| WP | งาน | Acceptance criteria |
|---|---|---|
| **3.1** | อัดเสียงไมค์: ปุ่ม ● บน transport → getUserMedia → อัดลง track ที่ arm ไว้ + option "ตั้งเป็น reference voice" ส่งเข้าคลังเสียง | อัด 5s → clip โผล่พร้อม waveform, ส่งเข้า /voices ได้ |
| **3.2** | Loop region + metronome: ลากบน ruler กำหนด loop, playback วน, click track ตาม BPM/sig (Web Audio scheduler) | loop วนเนียนไม่มี gap, metronome ตรง BPM ที่ 60–200 |
| **3.3** | Ruler seek + playhead drag + clip fade handles (fade in/out ต่อ clip, มีผลตอน preview + ส่งค่าไป export) | คลิก ruler = seek, ลากมุม clip = เส้น fade แสดง + ได้ยินผล |
| **3.4** | Stem faders: Remix แยก 4 stems (vocals/drums/bass/other — backend demucs รองรับ) + fader ต่อ stem ใน mix | remix แล้วปรับ stem แยกได้, ค่าถูก bake ตอน export |
| **3.5** | Batch queue: คิวงาน TTS/dubbing/mastering หลายไฟล์ รันต่อเนื่อง + หน้า queue (pause/ยกเลิก/ลำดับ) | ใส่ 5 งาน → รันเรียงจนจบ, ปิด panel แล้วคิวยังวิ่ง (jobs system เดิม) |
| **3.6** | Marketplace: ต่อข้อมูลจริงจาก backend packs + ตัด faux progress — หรือถ้า data ยังไม่มีจริง ให้ซ่อนแท็บ + flag ใน config | ไม่มี UI หลอกเหลือ (progress จริงจาก job/download event) |

---

### WAVE 4 — Agent Layer (4 WP, เริ่มขนานกับ Wave 3 ได้ — คนละพื้นที่ไฟล์)

| WP | งาน | Acceptance criteria |
|---|---|---|
| **4.1** | `chat_with_tools()` ใน `brain/base.py` + impl ทั้ง Ollama (JSON mode/tool tags) และ Cloud (Anthropic tools API, OpenAI function calling) | เทสต์: บังคับ tool call ง่ายๆ ได้ทั้ง 2 provider, fallback สุภาพเมื่อโมเดล local ไม่รองรับ |
| **4.2** | Tool schema + agent endpoint: `POST /agent/act` — tools อ่าน (get_project_state, analyze_bpm_key, get_stem_loudness ผ่าน DSP) + tools เขียน (move_clip, slice, set_gain/pan, set_fx, set_lufs, reorder) โดย **เขียน = คืน mutation list ไม่ execute เอง** | ส่งคำสั่ง "ลด beat ลงครึ่งหนึ่ง" → ได้ mutation JSON ที่ valid ต่อ schema |
| **4.3** | Frontend: Mix copilot panel — แชท + apply mutations ผ่าน `commit()` (Ctrl+Z ย้อนได้ทุกการแก้ของ AI) + ปุ่ม Auto-mix (วิเคราะห์ → เสนอ preset พร้อมคำอธิบายไทย → apply/ปฏิเสธ) | สั่งภาษาไทย → เห็น diff ก่อน apply → apply แล้ว undo ได้ 1 จังหวะ |
| **4.4** | Dubbing script copilot: หลังแปลแต่ละ segment มี "เกลาให้พอดีเวลา" (rewrite ให้สั้น/ยาวพอดี duration ก่อน TTS) + เลือกโทน ทางการ/กันเอง | segment ที่แปลยาวเกิน → หลังเกลา TTS ไม่ต้องบีบเสียงเกิน ±10% |

---

### WAVE 5 — Packaging & License (2 WP, backend/build — เริ่มได้ตั้งแต่จบ Wave 1)

| WP | งาน | Acceptance criteria |
|---|---|---|
| **5.1** | BYOM split: default = MIT stack เท่านั้น (demucs/librosa/pyloudnorm); psola/pedalboard/matchering เป็น optional — UI "ติดตั้ง plugin เสียง" กดลงเองผ่าน uv + ตรวจ availability ต่อ feature + เอกสาร license | ลบ GPL deps ออก → แอป boot + remix พื้นฐานยังได้ (ข้าม autotune/FX พร้อมข้อความบอก), หน้า plugin ติดตั้งกลับได้จริง |
| **5.2** | Tauri sidecar installer: bundle backend (PyInstaller/standalone python) เป็น sidecar + NSIS รวม, first-run wizard โหลดโมเดล (progress), ตรวจ CUDA/fallback CPU พร้อมคำเตือนความเร็ว | เครื่องเปล่า (ไม่มี Python): ติดตั้ง .exe เดียว → เปิด → TTS ประโยคแรกสำเร็จ ≤20 นาทีรวมโหลดโมเดล |

*(Backlog P2 ที่ตัดออกจาก swarm รอบนี้: multi-speaker diarization, macOS/Linux, drag-connect node graph เต็มรูปแบบ, command palette — เข้าคิวหลัง Wave 5)*

---

## 3. Gate Protocol (รายละเอียดที่ agent ทุกตัวต้องรู้)

**Worker (Sonnet 5) — สัญญางาน**
1. อ่าน WP + acceptance criteria + CLAUDE.md ก่อนแตะโค้ด
2. แตะเฉพาะไฟล์ใน scope; ต้องการไฟล์นอก scope → หยุดแล้วรายงาน (ห้ามแก้เอง)
3. ส่งงาน = diff + ผล `tsc --noEmit` + ผลเทสต์ + คำอธิบาย ≤10 บรรทัดว่าทำอะไร/ตัดสินใจอะไร

**Gate 1 (Opus — strict correctness) — ต่อ WP**
- รีวิว diff เท่านั้น: บั๊กจริง, type หลวม (`any`, `as` พร่ำเพรื่อ), ผิด acceptance criteria, ของหลอก (UI ไม่ต่อ logic), ภาษา UI ไม่ใช่ไทย, แตะไฟล์นอก scope
- Output: `APPROVE` หรือ `REJECT + รายการ finding ระบุไฟล์:บรรทัด` (worker แก้, สูงสุด 2 รอบ)

**Gate 2 (Opus — integration) — ต่อ wave**
- Merge ทุก worktree ที่ผ่าน Gate 1 เข้า branch `swarm/wave-N`
- รัน `tsc` + `vitest run` + `vite build` — พังตรง merge = แก้เอง, พังตรง logic = ตีกลับ WP นั้น
- ตรวจข้าม WP: pattern ซ้ำซ้อน (เช่น 2 WP สร้าง modal คนละแบบ), token ไม่ตรง, state ชนกัน
- Output: branch ที่ build เขียว + integration report

**Final Gate (Opus 4.8 — product) — ต่อ wave**
- รัน preview จริง (`npm run dev` + backend) → ไล่ acceptance criteria ของ wave ทีละข้อด้วย browser tools
- Regression ชุดคงที่: boot, สลับครบทุกแท็บ, TTS 1 งาน, save/load โปรเจกต์, undo/redo
- Output: `SHIP` (merge เข้า master + สรุปให้ผู้ใช้) หรือ `HOLD + เหตุผล`

**Escalation:** WP ที่ตก gate 3 ครั้ง → orchestrator (Fable) ตัดสิน: ทำเอง / ลด scope / เลื่อนเข้า backlog — ห้ามวนไม่รู้จบ

---

## 4. ประมาณการ

| Wave | WP | โหมด | ประมาณ token (คร่าว) |
|---|---|---|---|
| 0 | 7 | ขนานเต็ม | ~600k–900k |
| 1 | 3 | ขนาน | ~500k–800k (1.1 หนักสุด) |
| 2 | 2 | ต่อเนื่อง | ~400k–700k |
| 3 | 6 | ขนานเต็ม | ~700k–1M |
| 4 | 4 | ขนาน (คู่กับ 3) | ~500k–800k |
| 5 | 2 | ขนาน (เริ่มหลัง 1) | ~400k–600k (5.2 งานยาว มี unknown เยอะสุด)|
| **รวม** | **24 WP** | | **~3M–4.8M output tokens** |

**ความเสี่ยงหลัก:** (1) Wave 2 คือ refactor ใหญ่สุด — มีเทสต์จาก 0.1 + facade จาก 1.1 เป็นตาข่าย (2) WP 5.2 (sidecar) unknown สูง อาจต้องหลายรอบ (3) เครื่องเดียว GPU เดียว — งานที่ต้องรัน ML จริงตอน verify ให้เรียงคิว ไม่ขนาน

---

## 5. วิธีสั่งรัน

- เริ่มทั้งแผน: สั่ง "เริ่ม Wave 0" — orchestrator จะ spawn workflow ของ wave นั้น รายงานเมื่อผ่าน Final Gate แล้วหยุดรอคำสั่ง (หรือสั่ง "รันต่อเนื่องทุก wave" ถ้าจะปล่อยยาว)
- สถานะเก็บที่ไฟล์นี้ — จบแต่ละ wave ให้ orchestrator ติ๊ก ✅ ท้ายตาราง WP พร้อมวันที่
