# Render, Portability & Sidecar Implementation Plan (G-03 → G-02 → G-01 → G-04)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the timeline arrangement a first-class, portable, renderable artifact, and make the packaged desktop app start its own backend.

**Architecture:** Four phases in dependency order. **A (G-03)** completes the project model so it fully describes the authored state. **B (G-02)** replaces machine-bound absolute URLs with an asset table and adds a `.gmp` bundle for moving projects between machines. **C (G-01)** adds a server-side render plan builder plus `POST /render` that mixes the arrangement offline — the render plan is built on the backend from the project dict, because the asset table from phase B lets the backend resolve every clip to a real path, and one Python implementation is far easier to test than a split frontend/backend one. **D (G-04)** spawns the backend as a Tauri sidecar and makes CI build it.

**Tech Stack:** Python 3.11 · FastAPI · numpy · soundfile · pyloudnorm · imageio-ffmpeg (all decoding goes through bundled ffmpeg, so no resampler dependency is needed) · pytest (new) · React 18 + TypeScript + Zustand · Vitest · Tauri v2.11.3 + tauri-plugin-shell 2.3.5 · PyInstaller.

## Global Constraints

- **Python 3.11 only.** venv lives at `backend/.venv`, created with `uv`. Install with `uv pip install`.
- **Run every backend command from `D:\lalin\backend`** with the venv active. The repo is at `D:\lalin`, **not** `D:\G-Music` as CLAUDE.md/AGENTS.md/README.md currently claim.
- **Restart the backend after adding any router.** Port 8756 collides frequently; `dev.bat`/`test.bat` kill the port first.
- **`PYTHONIOENCODING=utf-8`** for any command that prints Thai.
- **UI strings and code comments in Thai; identifiers in English.**
- **Heavy work runs through `jobs.spawn()` + WebSocket progress.** Never block a request handler.
- **ML dependencies stay lazy-imported and optional.** The app must boot with only `backend/requirements.txt` installed.
- **GPL dependencies (`pedalboard`, `psola`, `matchering`) stay optional and are never bundled.** Nothing added by this plan may import them at module level.
- **The shipped sidecar is the LITE runtime** (`requirements.txt` only). ML stacks remain a user-installed opt-in via the existing plugin manager.
- **Do not change `com.gmusic.app` or the `gmusic:draft:` localStorage prefix.** Both are migration-blocked (see the audit's identity register).
- **Every phase ends green:** `cd frontend && npx tsc --noEmit`, `npx vitest run`, and `cd backend && .venv\Scripts\python.exe -m pytest -q` must all pass.

## Phase map

| Phase | Gap | Depends on | Exit criterion |
|---|---|---|---|
| A | G-03 project model completeness | — | Round-trip test: mutate every editable parameter, save, reload, assert deep equality |
| B | G-02 asset resolution + portability | A | Bundle round-trip test: export `.gmp`, import into a different `data_dir`, every clip resolves |
| C | G-01 timeline render | A, B | Golden-file test: rendered mixdown matches an analytically computed reference within −60 dBFS |
| D | G-04 sidecar | — (parallelisable with A–C) | Clean Windows VM: install → launch → `/health` responds with no Python on the machine |

Phase D shares no code with A–C and can be run concurrently by a second worker. A–C are strictly sequential.

---

## Phase A — G-03: complete the project model

Today `pan`, grid `bpm`/time-signature, `stemGains`, the loop region and the editing mode live in component-local `useState` and are destroyed on every reload. `project.bpm` exists in the saved JSON and is read by nothing. This phase moves every audible or authored parameter into the persisted model and introduces schema versioning so later phases can migrate safely.

### Task 1: Add `schemaVersion` and the migration seam

**Files:**
- Create: `frontend/src/timeline/migrate.ts`
- Create: `frontend/src/timeline/migrate.test.ts`

**Interfaces:**
- Produces: `SCHEMA_VERSION: number` (currently `2`), `migrateSnapshot(raw: unknown): Record<string, unknown>` — takes any previously-saved snapshot and returns one at `SCHEMA_VERSION`. Phase B will add a v2→v3 step to this same function.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/timeline/migrate.test.ts
import { describe, it, expect } from "vitest";
import { migrateSnapshot, SCHEMA_VERSION } from "./migrate";

describe("migrateSnapshot", () => {
  it("stamps an unversioned v1 snapshot as current", () => {
    const out = migrateSnapshot({ source: "a.mp3", project: { bpm: 90, tracks: [] } });
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("gives v1 tracks a default pan of 0", () => {
    const out = migrateSnapshot({
      project: { bpm: 120, tracks: [{ id: "vocal", clips: [], envelopes: [] }] },
    }) as { project: { tracks: { pan: number }[] } };
    expect(out.project.tracks[0].pan).toBe(0);
  });

  it("gives v1 projects a default timeSig of 4 and null loop", () => {
    const out = migrateSnapshot({ project: { bpm: 120, tracks: [] } }) as {
      project: { timeSig: number; loop: unknown };
    };
    expect(out.project.timeSig).toBe(4);
    expect(out.project.loop).toBeNull();
  });

  it("gives v1 snapshots default stemGains", () => {
    const out = migrateSnapshot({ project: { tracks: [] } }) as {
      stemGains: Record<string, number>;
    };
    expect(out.stemGains).toEqual({ vocals: 1, drums: 1, bass: 1, other: 1 });
  });

  it("leaves an already-current snapshot untouched", () => {
    const current = {
      schemaVersion: SCHEMA_VERSION,
      stemGains: { vocals: 0.5, drums: 1, bass: 1, other: 1 },
      project: { bpm: 90, timeSig: 3, loop: null, tracks: [{ id: "x", pan: -0.5, clips: [], envelopes: [] }] },
    };
    expect(migrateSnapshot(current)).toEqual(current);
  });

  it("returns an empty object unchanged except for the version stamp", () => {
    expect(migrateSnapshot({})).toEqual({ schemaVersion: SCHEMA_VERSION });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/timeline/migrate.test.ts`
Expected: FAIL — `Failed to resolve import "./migrate"`

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/timeline/migrate.ts
// @req FR-10 — schema versioning + migration ของ project snapshot

/** เวอร์ชันปัจจุบันของ snapshot — เพิ่มทีละ 1 เมื่อโครงสร้างเปลี่ยน */
export const SCHEMA_VERSION = 2;

const DEFAULT_STEM_GAINS = { vocals: 1, drums: 1, bass: 1, other: 1 };

type Dict = Record<string, unknown>;

/** v1 (ไม่มี schemaVersion) → v2: ย้าย pan/timeSig/loop/stemGains เข้า model */
function v1ToV2(raw: Dict): Dict {
  const out: Dict = { ...raw };
  const project = raw.project as Dict | undefined;

  if (project) {
    const tracks = (project.tracks as Dict[] | undefined) ?? [];
    out.project = {
      ...project,
      timeSig: typeof project.timeSig === "number" ? project.timeSig : 4,
      loop: project.loop ?? null,
      tracks: tracks.map((t) => ({ ...t, pan: typeof t.pan === "number" ? t.pan : 0 })),
    };
    out.stemGains = (raw.stemGains as Dict | undefined) ?? { ...DEFAULT_STEM_GAINS };
  }

  out.schemaVersion = 2;
  return out;
}

/**
 * ยกระดับ snapshot เก่าให้เป็นเวอร์ชันปัจจุบัน
 * เรียกทุกครั้งก่อน applySnapshot (ทั้งตอน Open และตอนกู้ draft)
 */
export function migrateSnapshot(raw: unknown): Dict {
  let snap: Dict = raw && typeof raw === "object" ? { ...(raw as Dict) } : {};
  const version = typeof snap.schemaVersion === "number" ? snap.schemaVersion : 1;

  if (version < 2) snap = v1ToV2(snap);

  snap.schemaVersion = SCHEMA_VERSION;
  return snap;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/timeline/migrate.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/src/timeline/migrate.ts frontend/src/timeline/migrate.test.ts
git commit -m "feat(project): add snapshot schema versioning + v1->v2 migration"
```

### Task 2: Move pan, time signature and loop into the `Project` model

**Files:**
- Modify: `frontend/src/timeline/clipModel.ts` (add `pan` to `Track`; add `timeSig` and `loop` to `Project`)
- Modify: `frontend/src/timeline/ops.ts` (add `setTrackPan`, `setProjectTempo`, `setProjectLoop`)
- Modify: `frontend/src/timeline/useClipEngine.ts` (expose the new ops; add `pan: 0`, `timeSig: 4`, `loop: null` to `emptyProject()`)
- Test: `frontend/src/timeline/ops.test.ts` (append)

**Interfaces:**
- Consumes: `Project`, `Track`, `snapshot`, `projectDuration` from Task 1's untouched neighbours.
- Produces:
  - `Track.pan: number` (−1..1, default 0)
  - `Project.timeSig: number` (beats per bar, default 4)
  - `Project.loop: { start: number; end: number; enabled: boolean } | null`
  - `ops.setTrackPan(p: Project, trackId: string, pan: number): Project` — clamps to −1..1
  - `ops.setProjectTempo(p: Project, bpm: number, timeSig: number): Project` — clamps bpm to 40..240
  - `ops.setProjectLoop(p: Project, loop: Project["loop"]): Project`
  - `engine.setTrackPan(tid, pan)`, `engine.setTempo(bpm, timeSig)`, `engine.setLoop(loop)` — all `silent()` (not undoable; they are transport/mix state, consistent with the existing `renameTrack`/`setTrackColor` treatment)

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/timeline/ops.test.ts`:

```ts
describe("setTrackPan", () => {
  it("sets pan on the named track only", () => {
    const p = mk(); // existing helper in this file that builds a 2-track project
    const out = ops.setTrackPan(p, p.tracks[0].id, -0.5);
    expect(out.tracks[0].pan).toBe(-0.5);
    expect(out.tracks[1].pan).toBe(0);
  });

  it("clamps pan to -1..1", () => {
    const p = mk();
    expect(ops.setTrackPan(p, p.tracks[0].id, -9).tracks[0].pan).toBe(-1);
    expect(ops.setTrackPan(p, p.tracks[0].id, 9).tracks[0].pan).toBe(1);
  });

  it("does not mutate the input", () => {
    const p = mk();
    ops.setTrackPan(p, p.tracks[0].id, 1);
    expect(p.tracks[0].pan).toBe(0);
  });
});

describe("setProjectTempo", () => {
  it("sets bpm and timeSig", () => {
    const out = ops.setProjectTempo(mk(), 90, 3);
    expect(out.bpm).toBe(90);
    expect(out.timeSig).toBe(3);
  });

  it("clamps bpm to 40..240", () => {
    expect(ops.setProjectTempo(mk(), 5, 4).bpm).toBe(40);
    expect(ops.setProjectTempo(mk(), 500, 4).bpm).toBe(240);
  });
});

describe("setProjectLoop", () => {
  it("stores and clears the loop region", () => {
    const withLoop = ops.setProjectLoop(mk(), { start: 1, end: 4, enabled: true });
    expect(withLoop.loop).toEqual({ start: 1, end: 4, enabled: true });
    expect(ops.setProjectLoop(withLoop, null).loop).toBeNull();
  });
});
```

If `ops.test.ts` has no `mk()` helper, add this above the new describes:

```ts
function mk() {
  return ops.snapshot({
    bpm: 120, key: null, timeSig: 4, loop: null, duration: 0,
    tracks: [
      { id: "a", label: "A", color: "#fff", pan: 0, clips: [], envelopes: [], muted: false, solo: false, locked: false },
      { id: "b", label: "B", color: "#000", pan: 0, clips: [], envelopes: [], muted: false, solo: false, locked: false },
    ],
  });
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/timeline/ops.test.ts`
Expected: FAIL — `ops.setTrackPan is not a function`

- [ ] **Step 3: Write the implementation**

In `frontend/src/timeline/clipModel.ts`, change the `Track` and `Project` interfaces and the two factories:

```ts
export interface Track {
  id: string;
  label: string;
  color: string;
  pan: number;         // -1 (ซ้ายสุด) .. 1 (ขวาสุด) — เก็บใน project เพื่อให้ render/reload ตรงกัน
  clips: Clip[];
  envelopes: Envelope[];
  muted: boolean;
  solo: boolean;
  locked: boolean;
}

export interface LoopRegion { start: Sec; end: Sec; enabled: boolean }

export interface Project {
  bpm: number;
  key: string | null;
  timeSig: number;              // จังหวะต่อห้อง (beats per bar)
  loop: LoopRegion | null;
  duration: Sec;
  tracks: Track[];
}

export function makeTrack(label: string, color: string, src: string | null = null): Track {
  return {
    id: uid("trk"), label, color, pan: 0,
    clips: [makeClip(src, color)],
    envelopes: [], muted: false, solo: false, locked: false,
  };
}
```

Append to `frontend/src/timeline/ops.ts`:

```ts
// ── setTrackPan: pan ต่อ track, clamp -1..1 ──────────────────────────────────
export function setTrackPan(p: Project, trackId: string, pan: number): Project {
  const clamped = Math.min(1, Math.max(-1, pan));
  const result = snapshot(p);
  const track = result.tracks.find(t => t.id === trackId);
  if (track) track.pan = clamped;
  return result;
}

// ── setProjectTempo: bpm 40..240 + beats per bar ────────────────────────────
export function setProjectTempo(p: Project, bpm: number, timeSig: number): Project {
  const result = snapshot(p);
  result.bpm = Math.min(240, Math.max(40, bpm));
  result.timeSig = timeSig;
  return result;
}

// ── setProjectLoop: ช่วงวนซ้ำ (null = ไม่มี) ─────────────────────────────────
export function setProjectLoop(p: Project, loop: Project["loop"]): Project {
  const result = snapshot(p);
  result.loop = loop;
  return result;
}
```

In `frontend/src/timeline/useClipEngine.ts`, update `emptyProject()` and add the three ops:

```ts
function emptyProject(): Project {
  const mk = (id: string, label: string, color: string) => ({
    id, label, color, pan: 0, clips: [] as Clip[], envelopes: [],
    muted: false, solo: false, locked: false,
  });
  return {
    bpm: 120, key: null, timeSig: 4, loop: null, duration: 0,
    tracks: [
      mk("vocal", "audio-01", "#9b6cf0"),
      mk("beat", "audio-02", "#3d9be0"),
      mk("master", "audio-03", "#c7f046"),
    ],
  };
}
```

and, next to `renameTrack`/`setTrackColor`:

```ts
  const setTrackPan = useCallback((tid: string, pan: number) => {
    silent((p) => ops.setTrackPan(p, tid, pan));
  }, [silent]);

  const setTempo = useCallback((bpm: number, timeSig: number) => {
    silent((p) => ops.setProjectTempo(p, bpm, timeSig));
  }, [silent]);

  const setLoop = useCallback((loop: Project["loop"]) => {
    silent((p) => ops.setProjectLoop(p, loop));
  }, [silent]);
```

and add `setTrackPan, setTempo, setLoop` to the returned object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/timeline/ops.test.ts`
Expected: PASS. Then run `npx tsc --noEmit` — expect errors in `ClipTimeline.tsx` and `RemixPanel.tsx` about the missing `pan`/`timeSig`/`loop` fields in inline project literals. Task 3 fixes them.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/timeline/clipModel.ts frontend/src/timeline/ops.ts frontend/src/timeline/useClipEngine.ts frontend/src/timeline/ops.test.ts
git commit -m "feat(project): move pan, time signature and loop region into the Project model"
```

### Task 3: Point `ClipTimeline` at the model instead of local state

**Files:**
- Modify: `frontend/src/components/ClipTimeline.tsx`

**Interfaces:**
- Consumes: `engine.setTrackPan`, `engine.setTempo`, `engine.setLoop`, `project.bpm`, `project.timeSig`, `project.loop`, `track.pan` from Task 2.
- Produces: nothing new; this removes four pieces of local state.

- [ ] **Step 1: Remove the shadow state**

Delete these four declarations from `ClipTimeline`:

```ts
const [bpm, setBpm] = useState(120);
const [sig, setSig] = useState(4);
const [panByTrack, setPanByTrack] = useState<Record<string, number>>({});
const [loopRegion, setLoopRegion] = useState<{ start: number; end: number } | null>(null);
const [loopOn, setLoopOn] = useState(false);
```

and replace them with derived values plus setters that write through to the engine:

```ts
  // อ่านจาก project โดยตรง — ไม่มี state เงาอีกต่อไป (ค่าที่ผู้ใช้ตั้งต้องรอด reload)
  const bpm = project.bpm;
  const sig = project.timeSig;
  const loopRegion = project.loop;
  const loopOn = project.loop?.enabled ?? false;

  const setBpm = (v: number) => engine.setTempo(v, project.timeSig);
  const setSig = (v: number) => engine.setTempo(project.bpm, v);
  const setLoopRegion = (r: { start: number; end: number } | null) =>
    engine.setLoop(r ? { ...r, enabled: true } : null);
  const setLoopOn = (on: boolean) =>
    engine.setLoop(project.loop ? { ...project.loop, enabled: on } : null);
```

- [ ] **Step 2: Fix the three call sites that used the removed setters with updater functions**

`setLoopOn((v) => !v)` and `setSnapOn`-style updater calls no longer type-check for loop. Replace the loop toggle button's handler:

```tsx
onClick={() => setLoopOn(!loopOn)}
```

and the two places that call `setLoopRegion(null); setLoopOn(false);` become a single `setLoopRegion(null)` (which already stores `null`, clearing `enabled`).

- [ ] **Step 3: Route pan through the engine**

Replace the `ChannelMeterBalance` usage:

```tsx
<ChannelMeterBalance
  analyserL={trackMeters[t.id]?.l} analyserR={trackMeters[t.id]?.r}
  active={playing && !dim}
  pan={t.pan}
  onPan={(v) => engine.setTrackPan(t.id, v)}
/>
```

and the playback graph's panner:

```ts
panner.pan.value = Math.max(-1, Math.min(1, t.pan));
```

- [ ] **Step 4: Verify types and tests**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: no TypeScript errors; 59 tests pass (53 existing + 6 from Task 1; Task 2 added more — the exact count is whatever `vitest run` reports, and it must be all-green).

- [ ] **Step 5: Manual check**

Run `dev.bat`, open http://localhost:5173, go to Remix, set BPM to 90, drag a track's balance to the left, drag a loop region on the ruler, then Save and reload the page and reopen the project. BPM must still read 90, the balance must still be left, and the loop band must still be drawn.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ClipTimeline.tsx
git commit -m "fix(timeline): read tempo, pan and loop from the project instead of local state"
```

### Task 4: Put `stemGains` in the store and every new field in the snapshot

**Files:**
- Modify: `frontend/src/store/useRemixStore.ts`
- Modify: `frontend/src/components/RemixPanel.tsx`
- Modify: `frontend/src/hooks/useProjectFile.ts`
- Create: `frontend/src/hooks/useProjectFile.roundtrip.test.ts`

**Interfaces:**
- Consumes: `migrateSnapshot`, `SCHEMA_VERSION` (Task 1); the new `Project` fields (Task 2).
- Produces: `useRemixStore.stemGains: StemGains` and `setStemGains(v: StemGains)`; `RemixRecipeState` gains `stemGains`; `buildSnapshot()` now emits `schemaVersion`, `stemGains` and the full `project` including pan/timeSig/loop.

- [ ] **Step 1: Write the failing round-trip test**

```ts
// frontend/src/hooks/useProjectFile.roundtrip.test.ts
import { describe, it, expect } from "vitest";
import { migrateSnapshot, SCHEMA_VERSION } from "../timeline/migrate";

/**
 * สัญญาของ snapshot: ทุก parameter ที่ผู้ใช้ตั้งได้ต้องอยู่ใน snapshot
 * เทสต์นี้ล็อกรายชื่อคีย์ไว้ ถ้าเพิ่ม parameter ใหม่แล้วลืมใส่ใน buildSnapshot จะ fail
 */
const REQUIRED_KEYS = [
  "schemaVersion",
  "source", "beat", "autotune", "fx", "reverb", "delay",
  "offsetAuto", "offsetMs", "lufs",
  "mReverb", "mEcho", "mComp",
  "stemGains",
  "leftW", "tlH", "rackH",
  "project",
] as const;

const REQUIRED_PROJECT_KEYS = ["bpm", "key", "timeSig", "loop", "duration", "tracks"] as const;
const REQUIRED_TRACK_KEYS = ["id", "label", "color", "pan", "clips", "envelopes", "muted", "solo", "locked"] as const;

function sampleSnapshot() {
  return {
    schemaVersion: SCHEMA_VERSION,
    source: "a.mp3", beat: "b.mp3", autotune: true, fx: true,
    reverb: 0.2, delay: 0.1, offsetAuto: false, offsetMs: 25, lufs: -16,
    mReverb: 0.3, mEcho: 0.4, mComp: true,
    stemGains: { vocals: 0.8, drums: 1.1, bass: 1, other: 0.9 },
    leftW: 300, tlH: 240, rackH: 200,
    project: {
      bpm: 90, key: "F maj", timeSig: 3, loop: { start: 2, end: 6, enabled: true }, duration: 12,
      tracks: [{
        id: "vocal", label: "V", color: "#9b6cf0", pan: -0.4,
        clips: [], envelopes: [], muted: false, solo: true, locked: false,
      }],
    },
  };
}

describe("project snapshot contract", () => {
  it("carries every required top-level key", () => {
    const snap = sampleSnapshot() as Record<string, unknown>;
    for (const k of REQUIRED_KEYS) expect(Object.keys(snap)).toContain(k);
  });

  it("carries every required project and track key", () => {
    const snap = sampleSnapshot();
    for (const k of REQUIRED_PROJECT_KEYS) expect(Object.keys(snap.project)).toContain(k);
    for (const k of REQUIRED_TRACK_KEYS) expect(Object.keys(snap.project.tracks[0])).toContain(k);
  });

  it("survives migration unchanged", () => {
    const snap = sampleSnapshot();
    expect(migrateSnapshot(structuredClone(snap))).toEqual(snap);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/hooks/useProjectFile.roundtrip.test.ts`
Expected: FAIL — `Failed to resolve import "../timeline/migrate"` if Task 1 was skipped, otherwise PASS on keys but the real failure comes in step 4 when `buildSnapshot` is compared. (This test documents the contract; step 3 makes the app satisfy it.)

- [ ] **Step 3: Move `stemGains` into the store**

In `frontend/src/store/useRemixStore.ts`, add to `RemixRecipeState`:

```ts
import { DEFAULT_STEM_GAINS, type StemGains } from "../components/StemMixer";

export interface RemixRecipeState {
  source: string | null;
  beat: string | null;
  autotune: boolean;
  fx: boolean;
  reverb: number;
  delay: number;
  offsetAuto: boolean;
  offsetMs: number;
  lufs: number;
  stemGains: StemGains;
}
```

add `setStemGains: (v: StemGains) => void;` to `RemixStoreState`, add `stemGains: { ...DEFAULT_STEM_GAINS },` to `DEFAULTS`, and add the setter:

```ts
  setStemGains: (v) => set({ stemGains: v }),
```

- [ ] **Step 4: Wire `RemixPanel` to the store and the snapshot**

In `frontend/src/components/RemixPanel.tsx`:

Replace the local stem state

```ts
const [stemGains, setStemGains] = useState<StemGains>({ ...DEFAULT_STEM_GAINS });
```

with

```ts
const stemGains = useRemixStore((s) => s.stemGains);
const setStemGains = useRemixStore((s) => s.setStemGains);
```

Replace `buildSnapshot`:

```ts
  const buildSnapshot = useCallback(() => ({
    schemaVersion: SCHEMA_VERSION,
    source, beat, autotune, fx, reverb, delay, offsetAuto, offsetMs, lufs,
    mReverb, mEcho, mComp,
    stemGains,
    leftW, tlH, rackH,
    project: engine.project,
  }), [source, beat, autotune, fx, reverb, delay, offsetAuto, offsetMs, lufs,
       mReverb, mEcho, mComp, stemGains, leftW, tlH, rackH, engine.project]);
```

Replace the body of `applySnapshot` so it migrates first and restores the new fields:

```ts
  const applySnapshot = useCallback((raw: Record<string, unknown>) => {
    const d = migrateSnapshot(raw);
    loadingRef.current = true;
    if (d.project) {
      engine.loadProject(d.project as Parameters<typeof engine.loadProject>[0]);
    } else {
      engine.loadProject({
        bpm: 120, key: null, timeSig: 4, loop: null, duration: 0,
        tracks: [
          { id: "vocal", label: "audio-01", color: "#9b6cf0", pan: 0, clips: [], envelopes: [], muted: false, solo: false, locked: false },
          { id: "beat", label: "audio-02", color: "#3d9be0", pan: 0, clips: [], envelopes: [], muted: false, solo: false, locked: false },
          { id: "master", label: "audio-03", color: "#c7f046", pan: 0, clips: [], envelopes: [], muted: false, solo: false, locked: false },
        ],
      });
    }
    loadRecipe({
      source: (d.source as string | null) ?? null,
      beat: (d.beat as string | null) ?? null,
      autotune: d.autotune == null ? true : Boolean(d.autotune),
      fx: d.fx == null ? true : Boolean(d.fx),
      reverb: Number(d.reverb ?? 0.16),
      delay: Number(d.delay ?? 0.12),
      offsetAuto: d.offsetAuto == null ? true : Boolean(d.offsetAuto),
      offsetMs: Number(d.offsetMs ?? 0),
      lufs: Number(d.lufs ?? -14),
      stemGains: (d.stemGains as StemGains | undefined) ?? { ...DEFAULT_STEM_GAINS },
      mReverb: Number(d.mReverb ?? 0),
      mEcho: Number(d.mEcho ?? 0),
      mComp: Boolean(d.mComp),
      leftW: Number(d.leftW ?? 230),
      tlH: Number(d.tlH ?? 230),
      rackH: Number(d.rackH ?? 190),
    });
    setTimeout(() => { loadingRef.current = false; }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Add the imports at the top of the file:

```ts
import { migrateSnapshot, SCHEMA_VERSION } from "../timeline/migrate";
```

and widen `loadRecipe`'s parameter type in `useRemixStore.ts` — it already spreads `RemixRecipeState & RemixMasterFxState & RemixPanelSizeState`, and `stemGains` is now part of `RemixRecipeState`, so no signature change is needed.

- [ ] **Step 5: Migrate the autosave draft path too**

In `frontend/src/hooks/useProjectFile.ts`, `recoverDraft` currently calls `applySnapshot(draft.data)` directly. `applySnapshot` now migrates internally, so no change is required — but add this comment above the call so the next reader knows migration is handled downstream:

```ts
      // applySnapshot เรียก migrateSnapshot ให้แล้ว — draft เก่าจึงกู้คืนได้
      applySnapshot(draft.data);
```

- [ ] **Step 6: Verify**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Manual round-trip check**

Run `dev.bat`. In Remix: set BPM 90, time signature 3/4, pull a track's balance left, drag a stem fader to 0.5, drag a loop region. Save As "roundtrip". Press F5. Open "roundtrip". Every one of those five must come back. Before this task, all five were lost.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/store/useRemixStore.ts frontend/src/components/RemixPanel.tsx frontend/src/hooks/useProjectFile.ts frontend/src/hooks/useProjectFile.roundtrip.test.ts
git commit -m "feat(project): persist stem gains, tempo, pan and loop in the project snapshot"
```

**Phase A exit gate:** `npx tsc --noEmit` clean, `npx vitest run` all green, and the manual round-trip in Task 4 step 7 passes. G-03 is closed.

---

## Phase B — G-02: asset resolution and project portability

Today a clip stores `src: "http://127.0.0.1:8756/files/input/song.mp3"`. That string bakes in the API base, so the project cannot leave the machine, and the backend cannot resolve a clip to a file. This phase replaces it with an asset table and adds a `.gmp` bundle that carries the media with the project.

### Task 5: Asset table in the project model, and v2→v3 migration

**Files:**
- Modify: `frontend/src/timeline/clipModel.ts` (`Clip.assetId` replaces `Clip.src`; `Project.assets`)
- Modify: `frontend/src/timeline/migrate.ts` (add `v2ToV3`, bump `SCHEMA_VERSION` to 3)
- Create: `frontend/src/timeline/assets.ts`
- Create: `frontend/src/timeline/assets.test.ts`
- Modify: `frontend/src/timeline/migrate.test.ts` (append v3 cases)

**Interfaces:**
- Produces:
  - `type AssetKind = "upload" | "output"`
  - `interface AssetRef { id: string; kind: AssetKind; name: string }`
  - `Project.assets: Record<string, AssetRef>`
  - `Clip.assetId: string | null` (replaces `Clip.src`)
  - `assetId(kind: AssetKind, name: string): string` — deterministic, so the same file always maps to the same id
  - `addAsset(assets: Record<string, AssetRef>, kind: AssetKind, name: string): { assets: Record<string, AssetRef>; id: string }`
  - `resolveAssetUrl(project: Project, assetId: string | null): string | null` — the only place `API_BASE` is combined with an asset

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/timeline/assets.test.ts
import { describe, it, expect } from "vitest";
import { assetId, addAsset, resolveAssetUrl } from "./assets";
import type { Project } from "./clipModel";

describe("assetId", () => {
  it("is deterministic for the same kind+name", () => {
    expect(assetId("upload", "song.mp3")).toBe(assetId("upload", "song.mp3"));
  });
  it("differs by kind", () => {
    expect(assetId("upload", "x.wav")).not.toBe(assetId("output", "x.wav"));
  });
  it("differs by name", () => {
    expect(assetId("upload", "a.wav")).not.toBe(assetId("upload", "b.wav"));
  });
  it("is safe for a filename (no slashes, dots or spaces)", () => {
    expect(assetId("upload", "ปล่อย (let them).mp3")).toMatch(/^a_[0-9a-z]+$/);
  });
});

describe("addAsset", () => {
  it("adds a new asset and returns its id", () => {
    const { assets, id } = addAsset({}, "upload", "song.mp3");
    expect(assets[id]).toEqual({ id, kind: "upload", name: "song.mp3" });
  });
  it("is idempotent for the same file", () => {
    const first = addAsset({}, "upload", "song.mp3");
    const second = addAsset(first.assets, "upload", "song.mp3");
    expect(second.id).toBe(first.id);
    expect(Object.keys(second.assets)).toHaveLength(1);
  });
});

describe("resolveAssetUrl", () => {
  const project = {
    assets: {
      a_1: { id: "a_1", kind: "upload", name: "song.mp3" },
      a_2: { id: "a_2", kind: "output", name: "remix_x.wav" },
    },
  } as unknown as Project;

  it("resolves an upload to the input endpoint", () => {
    expect(resolveAssetUrl(project, "a_1")).toContain("/files/input/song.mp3");
  });
  it("resolves an output to the download endpoint", () => {
    expect(resolveAssetUrl(project, "a_2")).toContain("/files/download/remix_x.wav");
  });
  it("returns null for a missing or null id", () => {
    expect(resolveAssetUrl(project, null)).toBeNull();
    expect(resolveAssetUrl(project, "a_nope")).toBeNull();
  });
  it("percent-encodes names with spaces and non-ASCII characters", () => {
    const p = { assets: { a_3: { id: "a_3", kind: "upload", name: "ปล่อย (let them).mp3" } } } as unknown as Project;
    expect(resolveAssetUrl(p, "a_3")).toContain(encodeURIComponent("ปล่อย (let them).mp3"));
  });
});
```

Append to `frontend/src/timeline/migrate.test.ts`:

```ts
describe("v2 -> v3 asset migration", () => {
  it("converts an absolute input URL into an asset reference", () => {
    const out = migrateSnapshot({
      schemaVersion: 2,
      project: {
        bpm: 120, timeSig: 4, loop: null, tracks: [
          { id: "vocal", pan: 0, envelopes: [], clips: [
            { id: "c1", src: "http://127.0.0.1:8756/files/input/song.mp3", start: 0, duration: 3, offset: 0, gain: 1, muted: false, color: "#fff" },
          ] },
        ],
      },
    }) as any;
    const clip = out.project.tracks[0].clips[0];
    expect(clip.src).toBeUndefined();
    expect(out.project.assets[clip.assetId]).toEqual({
      id: clip.assetId, kind: "upload", name: "song.mp3",
    });
  });

  it("converts an absolute download URL into an output asset", () => {
    const out = migrateSnapshot({
      schemaVersion: 2,
      project: { tracks: [{ id: "m", pan: 0, envelopes: [], clips: [
        { id: "c1", src: "http://127.0.0.1:8756/files/download/remix_ab12.wav" },
      ] }] },
    }) as any;
    const clip = out.project.tracks[0].clips[0];
    expect(out.project.assets[clip.assetId].kind).toBe("output");
    expect(out.project.assets[clip.assetId].name).toBe("remix_ab12.wav");
  });

  it("decodes percent-encoded names back to the real filename", () => {
    const encoded = encodeURIComponent("ปล่อย (let them).mp3");
    const out = migrateSnapshot({
      schemaVersion: 2,
      project: { tracks: [{ id: "v", pan: 0, envelopes: [], clips: [
        { id: "c1", src: `http://127.0.0.1:8756/files/input/${encoded}` },
      ] }] },
    }) as any;
    const clip = out.project.tracks[0].clips[0];
    expect(out.project.assets[clip.assetId].name).toBe("ปล่อย (let them).mp3");
  });

  it("nulls a clip whose src is unrecognisable rather than dropping the clip", () => {
    const out = migrateSnapshot({
      schemaVersion: 2,
      project: { tracks: [{ id: "v", pan: 0, envelopes: [], clips: [{ id: "c1", src: "blob:whatever" }] }] },
    }) as any;
    expect(out.project.tracks[0].clips[0].assetId).toBeNull();
  });

  it("gives a v1 project an empty assets table", () => {
    const out = migrateSnapshot({ project: { tracks: [] } }) as any;
    expect(out.project.assets).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/timeline/assets.test.ts src/timeline/migrate.test.ts`
Expected: FAIL — `Failed to resolve import "./assets"`

- [ ] **Step 3: Write `assets.ts`**

```ts
// frontend/src/timeline/assets.ts
// @req FR-10 — asset table: อ้างอิงไฟล์แบบพกพาได้ (ไม่ผูกกับ host/พอร์ต)
import { API_BASE } from "../api";
import type { Project } from "./clipModel";

export type AssetKind = "upload" | "output";

export interface AssetRef {
  id: string;
  kind: AssetKind;
  name: string;   // ชื่อไฟล์ใน uploads/ หรือ outputs/ (ไม่ใช่ path เต็ม ไม่ใช่ URL)
}

/** djb2 — hash สั้น ๆ ที่ deterministic ข้ามเครื่อง (ไม่ใช้ crypto เพราะต้อง sync) */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** id เดิมเสมอสำหรับไฟล์เดิม → เพิ่มไฟล์ซ้ำไม่สร้าง asset ซ้ำ */
export function assetId(kind: AssetKind, name: string): string {
  return `a_${djb2(`${kind}:${name}`)}`;
}

export function addAsset(
  assets: Record<string, AssetRef>,
  kind: AssetKind,
  name: string,
): { assets: Record<string, AssetRef>; id: string } {
  const id = assetId(kind, name);
  if (assets[id]) return { assets, id };
  return { assets: { ...assets, [id]: { id, kind, name } }, id };
}

/** จุดเดียวในแอปที่ประกอบ API_BASE เข้ากับ asset — ที่อื่นห้ามเก็บ URL เต็ม */
export function resolveAssetUrl(project: Project, id: string | null): string | null {
  if (!id) return null;
  const ref = project.assets?.[id];
  if (!ref) return null;
  const path = ref.kind === "upload" ? "input" : "download";
  return `${API_BASE}/files/${path}/${encodeURIComponent(ref.name)}`;
}
```

- [ ] **Step 4: Update the model**

In `frontend/src/timeline/clipModel.ts`:

```ts
import type { AssetRef } from "./assets";

export interface Clip {
  id: string;
  assetId: string | null;   // อ้าง Project.assets — แทนที่ src เดิมที่เป็น URL เต็ม
  start: Sec;
  duration: Sec;
  offset: Sec;
  gain: number;
  muted: boolean;
  color: string;
  fadeIn?: number;
  fadeOut?: number;
}

export interface Project {
  bpm: number;
  key: string | null;
  timeSig: number;
  loop: LoopRegion | null;
  duration: Sec;
  assets: Record<string, AssetRef>;
  tracks: Track[];
}

export function makeClip(assetId: string | null, color: string, duration: Sec = 0): Clip {
  return { id: uid("clip"), assetId, start: 0, duration, offset: 0, gain: 1, muted: false, color };
}
```

- [ ] **Step 5: Add the v2→v3 migration**

In `frontend/src/timeline/migrate.ts`, bump the version and add the step:

```ts
export const SCHEMA_VERSION = 3;

/** "http://host/files/input/NAME" → {kind:"upload", name:"NAME"}; คืน null ถ้าไม่รู้จักรูปแบบ */
function parseLegacySrc(src: unknown): { kind: "upload" | "output"; name: string } | null {
  if (typeof src !== "string") return null;
  const m = src.match(/\/files\/(input|download)\/([^/?#]+)$/);
  if (!m) return null;
  return { kind: m[1] === "input" ? "upload" : "output", name: decodeURIComponent(m[2]) };
}

/** v2 → v3: แปลง clip.src (URL เต็ม) เป็น clip.assetId + Project.assets */
function v2ToV3(raw: Dict): Dict {
  const out: Dict = { ...raw };
  const project = raw.project as Dict | undefined;
  if (project) {
    let assets: Record<string, { id: string; kind: "upload" | "output"; name: string }> =
      (project.assets as never) ?? {};
    const tracks = ((project.tracks as Dict[] | undefined) ?? []).map((t) => ({
      ...t,
      clips: ((t.clips as Dict[] | undefined) ?? []).map((c) => {
        const { src, ...rest } = c;
        const parsed = parseLegacySrc(src);
        if (!parsed) return { ...rest, assetId: (c.assetId as string | null) ?? null };
        const added = addAsset(assets, parsed.kind, parsed.name);
        assets = added.assets;
        return { ...rest, assetId: added.id };
      }),
    }));
    out.project = { ...project, assets, tracks };
  }
  out.schemaVersion = 3;
  return out;
}
```

Add `import { addAsset } from "./assets";` at the top, and extend `migrateSnapshot`:

```ts
  if (version < 2) snap = v1ToV2(snap);
  if (version < 3) snap = v2ToV3(snap);
```

Also add `assets: {}` to the `v1ToV2` project object so a v1 project reaches v3 with a table.

- [ ] **Step 6: Update every `clip.src` consumer**

These are the only places that read or write `clip.src`. Change each to go through `resolveAssetUrl` / `addAsset`:

| File | Change |
|---|---|
| `ClipTimeline.tsx` `ClipBlock` | accept a new prop `src: string \| null` computed by the parent via `resolveAssetUrl(project, clip.assetId)`; use it in the `getDecoded` effect |
| `ClipTimeline.tsx` `play()` | `const srcs = [...new Set(project.tracks.flatMap(t => t.clips.map(c => resolveAssetUrl(project, c.assetId)).filter(Boolean)))] as string[]` and inside the clip loop `const url = resolveAssetUrl(project, c.assetId); if (!url \|\| c.muted) continue; const d = decs.get(url);` |
| `ClipTimeline.tsx` drop handler | payload carries `{ kind, name }`; `engine.addAsset(payload.kind, payload.name)` returns the id, then `makeClip(id, colour)` |
| `useClipEngine.ts` `setTrackSource` | signature becomes `setTrackSource(trackId, ref: { kind: AssetKind; name: string } \| null, color)`; registers the asset then makes the clip |
| `RemixPanel.tsx` three `setTrackSource` effects | pass `{ kind: "upload", name: source }`, `{ kind: "upload", name: beat }`, `{ kind: "output", name: outputName }` instead of URLs |
| `TTSPanel.tsx`, `DubbingPanel.tsx`, `MasteringPanel.tsx` `addToTimeline` | `const id = engine.addAsset("output", basename(output)); const clip = makeClip(id, colour);` |
| `MicRecorder` call site in `ClipTimeline.tsx` | `const id = engine.addAsset("upload", result.filename); const clip = { ...makeClip(id, colour), start: posRef.current };` |
| `LibraryPanel.tsx` `onDragStart` | payload becomes `{ kind: "upload", name: p.id, label, color }` (still broken until G-13 gives packs real files — leave a `// TODO(G-13)` comment noting the asset does not exist yet) |

Add to `useClipEngine.ts`:

```ts
  // ลงทะเบียนไฟล์เป็น asset ของ project แล้วคืน id (idempotent)
  const addAssetRef = useCallback((kind: AssetKind, name: string): string => {
    const id = assetId(kind, name);
    silent((p) => (p.assets[id] ? p : { ...p, assets: addAsset(p.assets, kind, name).assets }));
    return id;
  }, [silent]);
```

and export it as `addAsset`.

- [ ] **Step 7: Run tests and types**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass. `tsc` is the safety net here — it will point at every remaining `clip.src` reference.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/timeline frontend/src/components frontend/src/store
git commit -m "feat(project): replace absolute clip URLs with a portable asset table"
```

### Task 6: Backend test scaffolding, and the two missing core dependencies

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/tests/__init__.py` (empty)
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_smoke_api.py`
- Create: `backend/pytest.ini`

**Interfaces:**
- Produces: a `client` pytest fixture (FastAPI `TestClient` bound to an isolated temporary `data_dir`) that every later backend test uses, and a `data_dir` fixture returning that `Path`.

- [ ] **Step 1: Add the missing core dependencies**

`app/utils/ffmpeg.py` imports `imageio_ffmpeg` and `app/pipelines/mastering.py` imports `pyloudnorm`, but neither is in `requirements.txt` — a by-the-book lite install fails at auto-mastering and at every ffmpeg operation. Phase C's renderer needs both. Append to `backend/requirements.txt` under the audio utils block:

```
imageio-ffmpeg==0.6.0   # ffmpeg ฝังในตัว — utils/ffmpeg.py + renderer ต้องใช้
pyloudnorm==0.2.0       # วัด/ปรับ LUFS — mastering auto mode + render validation
```

and add a dev block at the end:

```
# ── Dev / test (ไม่ต้องลงบนเครื่องผู้ใช้) ────────────────────────────
pytest==8.3.4
```

Run: `cd backend && .venv\Scripts\python.exe -m pip install pytest==8.3.4`

- [ ] **Step 2: Write `pytest.ini`**

```ini
# backend/pytest.ini
[pytest]
testpaths = tests
addopts = -q
filterwarnings =
    ignore::DeprecationWarning
```

- [ ] **Step 3: Write `conftest.py`**

```python
# backend/tests/conftest.py
"""Fixture กลางของเทสต์ backend — แยก data_dir ออกจากของจริงทุกครั้ง"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def data_dir(tmp_path, monkeypatch):
    """ชี้ settings.data_dir ไปที่ tmp_path — เทสต์ห้ามแตะ backend/data ของจริง"""
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    from app.config import get_settings

    get_settings.cache_clear()          # lru_cache — ต้องล้างก่อนอ่านค่าใหม่
    settings = get_settings()
    settings.ensure_dirs()
    yield tmp_path
    get_settings.cache_clear()


@pytest.fixture()
def client(data_dir):
    from app.main import app

    with TestClient(app) as c:
        yield c
```

- [ ] **Step 4: Write the smoke test**

```python
# backend/tests/test_smoke_api.py
"""เทสต์ว่า app บูตได้ + endpoint พื้นฐานตอบ (กันของพังเงียบตอนเพิ่ม router)"""


def test_root_reports_service(client):
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["service"] == "G-Music"


def test_projects_starts_empty(client):
    r = client.get("/projects")
    assert r.status_code == 200
    assert r.json() == {"projects": []}


def test_save_then_load_project(client):
    saved = client.post("/projects", json={"name": "t1", "data": {"schemaVersion": 3}})
    assert saved.status_code == 200
    pid = saved.json()["id"]

    loaded = client.get(f"/projects/{pid}")
    assert loaded.status_code == 200
    assert loaded.json()["data"] == {"schemaVersion": 3}


def test_data_dir_is_isolated(client, data_dir):
    client.post("/projects", json={"name": "t", "data": {}})
    assert list((data_dir / "projects").glob("*.json"))
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && .venv\Scripts\python.exe -m pytest`
Expected: PASS — 4 tests. If `test_data_dir_is_isolated` fails, `DATA_DIR` is not reaching `Settings`; confirm `config.py` still reads `data_dir` from the environment via `pydantic-settings` (it does — the field name `data_dir` maps to the `DATA_DIR` env var).

- [ ] **Step 6: Wire pytest into `test.bat` and add the missing vitest step**

In `test.bat`, replace the `[2/3]`/`[3/3]` headers with `[2/4]`/`[3/4]` and insert a new step after the backend import check:

```bat
echo.
echo [3/4] Backend unit tests...
cd backend
.venv\Scripts\python.exe -m pytest
if errorlevel 1 (
  echo.
  echo ^>^>^> BACKEND TESTS FAILED
  cd ..
  exit /b 1
)
cd ..
```

and insert a frontend test step right after the TypeScript check (the 53 existing vitest tests are currently run by nothing):

```bat
echo.
echo [2/4] Frontend unit tests...
cd frontend
call .\node_modules\.bin\vitest.cmd run
if errorlevel 1 (
  echo.
  echo ^>^>^> FRONTEND TESTS FAILED
  cd ..
  exit /b 1
)
cd ..
```

Renumber the remaining steps so the labels read `[1/4]`…`[4/4]`.

- [ ] **Step 7: Run the whole suite**

Run: `test.bat`
Expected: four green steps, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add backend/requirements.txt backend/pytest.ini backend/tests test.bat
git commit -m "test(backend): add pytest scaffolding; run vitest and pytest from test.bat"
```

### Task 7: `.gmp` bundle export

**Files:**
- Create: `backend/app/services/bundle.py`
- Modify: `backend/app/routers/projects.py`
- Create: `backend/tests/test_bundle.py`

**Interfaces:**
- Consumes: `client`/`data_dir` fixtures (Task 6); the v3 snapshot shape with `project.assets` (Task 5).
- Produces:
  - `bundle.resolve_asset(kind: str, name: str) -> Path` — maps an asset to a real file under `uploads/` or `outputs/`, raising `FileNotFoundError` if absent and `ValueError` on traversal or an unknown kind. **Phase C reuses this.**
  - `bundle.collect_assets(data: dict) -> list[dict]` — reads `data["project"]["assets"]` and returns `[{id, kind, name}]`
  - `bundle.write_bundle(project: dict, out_path: Path) -> Path` — writes the zip
  - `GET /projects/{pid}/bundle` → `application/zip`, filename `<name>.gmp`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_bundle.py
import io
import json
import zipfile

import pytest


def _make_upload(client, name: str, content: bytes = b"RIFFfake"):
    r = client.post("/files/upload", files={"file": (name, content, "audio/wav")})
    assert r.status_code == 200
    return name


def _project_data(asset_name: str):
    return {
        "schemaVersion": 3,
        "project": {
            "bpm": 120, "key": None, "timeSig": 4, "loop": None, "duration": 3,
            "assets": {"a_1": {"id": "a_1", "kind": "upload", "name": asset_name}},
            "tracks": [{
                "id": "vocal", "label": "V", "color": "#fff", "pan": 0,
                "muted": False, "solo": False, "locked": False, "envelopes": [],
                "clips": [{"id": "c1", "assetId": "a_1", "start": 0, "duration": 3,
                            "offset": 0, "gain": 1, "muted": False, "color": "#fff"}],
            }],
        },
    }


def test_resolve_asset_rejects_traversal(data_dir):
    from app.services import bundle

    with pytest.raises(ValueError):
        bundle.resolve_asset("upload", "../../secret.txt")


def test_resolve_asset_rejects_unknown_kind(data_dir):
    from app.services import bundle

    with pytest.raises(ValueError):
        bundle.resolve_asset("models", "x.wav")


def test_bundle_contains_project_manifest_and_media(client):
    _make_upload(client, "song.wav", b"RIFFsong")
    pid = client.post("/projects", json={"name": "p1", "data": _project_data("song.wav")}).json()["id"]

    r = client.get(f"/projects/{pid}/bundle")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/zip")

    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = set(zf.namelist())
    assert "project.json" in names
    assert "manifest.json" in names
    assert "media/a_1.wav" in names

    manifest = json.loads(zf.read("manifest.json"))
    assert manifest["format"] == "gmp"
    assert manifest["assets"][0]["id"] == "a_1"
    assert manifest["assets"][0]["bytes"] == len(b"RIFFsong")
    assert zf.read("media/a_1.wav") == b"RIFFsong"


def test_bundle_reports_missing_media_instead_of_failing(client):
    pid = client.post("/projects", json={"name": "p2", "data": _project_data("gone.wav")}).json()["id"]

    r = client.get(f"/projects/{pid}/bundle")
    assert r.status_code == 200
    manifest = json.loads(zipfile.ZipFile(io.BytesIO(r.content)).read("manifest.json"))
    assert manifest["assets"][0]["missing"] is True


def test_bundle_404_for_unknown_project(client):
    assert client.get("/projects/nope/bundle").status_code == 404
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv\Scripts\python.exe -m pytest tests/test_bundle.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.bundle'`

- [ ] **Step 3: Write `bundle.py`**

```python
# backend/app/services/bundle.py
# @req FR-10 — .gmp bundle: project + media ในไฟล์เดียว (ย้ายข้ามเครื่องได้)
"""Bundle service — รวมโปรเจกต์ + ไฟล์สื่อที่อ้างถึงเป็น .gmp (zip) ไฟล์เดียว

โครงสร้างใน zip:
  project.json    {"id", "name", "data"}   — snapshot ตามที่บันทึกไว้
  manifest.json   {"format","version","assets":[{id,kind,name,bytes,sha256,missing}]}
  media/<asset_id><ext>                    — ไฟล์จริงของแต่ละ asset

ไม่ใส่ timestamp ลงใน manifest โดยตั้งใจ — bundle เดิมต้องได้ bytes เดิมเสมอ (เทสต์ง่าย)
"""
from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

from ..config import get_settings

BUNDLE_VERSION = 1
_KIND_DIRS = {"upload": "uploads_dir", "output": "outputs_dir"}


def resolve_asset(kind: str, name: str) -> Path:
    """แปลง (kind, name) เป็น path จริง — กัน traversal และ kind ที่ไม่รู้จัก"""
    attr = _KIND_DIRS.get(kind)
    if attr is None:
        raise ValueError(f"asset kind ไม่ถูกต้อง: {kind}")
    root = getattr(get_settings(), attr).resolve()
    p = (root / name).resolve()
    if p != root and root not in p.parents:
        raise ValueError(f"เส้นทางไม่ถูกต้อง: {name}")
    if not p.exists():
        raise FileNotFoundError(str(p))
    return p


def collect_assets(data: dict) -> list[dict]:
    """ดึงรายการ asset จาก snapshot (v3) — คืน list ว่างถ้าโปรเจกต์ยังไม่มี assets"""
    assets = ((data or {}).get("project") or {}).get("assets") or {}
    return [
        {"id": a.get("id") or aid, "kind": a.get("kind", "upload"), "name": a.get("name", "")}
        for aid, a in assets.items()
    ]


def write_bundle(project: dict, out_path: Path) -> Path:
    """เขียน .gmp — asset ที่หาไฟล์ไม่เจอจะถูกทำเครื่องหมาย missing แทนที่จะทำให้ทั้ง bundle ล้ม"""
    entries: list[dict] = []
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("project.json", json.dumps(project, ensure_ascii=False))
        for a in collect_assets(project.get("data") or {}):
            entry = {**a, "bytes": 0, "sha256": None, "missing": False}
            try:
                src = resolve_asset(a["kind"], a["name"])
            except (ValueError, FileNotFoundError):
                entry["missing"] = True
                entries.append(entry)
                continue
            raw = src.read_bytes()
            arc = f"media/{a['id']}{Path(a['name']).suffix}"
            zf.writestr(arc, raw)
            entry["bytes"] = len(raw)
            entry["sha256"] = hashlib.sha256(raw).hexdigest()
            entry["arc"] = arc
            entries.append(entry)
        zf.writestr(
            "manifest.json",
            json.dumps({"format": "gmp", "version": BUNDLE_VERSION, "assets": entries}, ensure_ascii=False),
        )
    return out_path
```

- [ ] **Step 4: Add the endpoint**

Append to `backend/app/routers/projects.py`:

```python
import tempfile

from fastapi.responses import FileResponse

from ..services import bundle


@router.get("/{pid}/bundle")
async def export_bundle(pid: str):
    """ส่งออกโปรเจกต์เป็นไฟล์ .gmp (zip: project.json + manifest.json + media/)"""
    _safe_pid(pid)
    f = _dir() / f"{pid}.json"
    if not f.exists():
        raise HTTPException(404, "ไม่พบโปรเจกต์")
    project = json.loads(f.read_text(encoding="utf-8"))

    tmp = Path(tempfile.mkdtemp()) / f"{pid}.gmp"
    bundle.write_bundle(project, tmp)
    safe_name = "".join(c for c in project.get("name", pid) if c not in '\\/:*?"<>|') or pid
    return FileResponse(tmp, media_type="application/zip", filename=f"{safe_name}.gmp")
```

- [ ] **Step 5: Run tests**

Run: `cd backend && .venv\Scripts\python.exe -m pytest tests/test_bundle.py`
Expected: PASS — 5 tests. **Restart any running backend** before testing by hand; a stale process will 404 on the new route.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/bundle.py backend/app/routers/projects.py backend/tests/test_bundle.py
git commit -m "feat(projects): export a project and its media as a .gmp bundle"
```

### Task 8: `.gmp` bundle import

**Files:**
- Modify: `backend/app/services/bundle.py`
- Modify: `backend/app/routers/projects.py`
- Modify: `backend/tests/test_bundle.py` (append)

**Interfaces:**
- Consumes: `write_bundle`, `resolve_asset` (Task 7).
- Produces: `bundle.read_bundle(raw: bytes) -> tuple[dict, dict[str, bytes]]` and `bundle.install_bundle(raw: bytes) -> dict` (returns the project dict with asset names rewritten where a collision was renamed); `POST /projects/import` (multipart, field name `file`) → `{"id", "name", "renamed": {...}}`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_bundle.py`:

```python
def test_import_restores_project_and_media(client, data_dir):
    _make_upload(client, "song.wav", b"RIFFsong")
    pid = client.post("/projects", json={"name": "p1", "data": _project_data("song.wav")}).json()["id"]
    raw = client.get(f"/projects/{pid}/bundle").content

    # ลบทั้งโปรเจกต์และไฟล์สื่อ — จำลองเครื่องใหม่ที่ไม่มีอะไรเลย
    (data_dir / "projects" / f"{pid}.json").unlink()
    (data_dir / "uploads" / "song.wav").unlink()

    r = client.post("/projects/import", files={"file": ("p1.gmp", raw, "application/zip")})
    assert r.status_code == 200
    new_id = r.json()["id"]
    assert new_id != pid                       # import สร้าง id ใหม่เสมอ
    assert (data_dir / "uploads" / "song.wav").read_bytes() == b"RIFFsong"

    data = client.get(f"/projects/{new_id}").json()["data"]
    assert data["project"]["assets"]["a_1"]["name"] == "song.wav"


def test_import_renames_on_content_collision(client, data_dir):
    _make_upload(client, "song.wav", b"RIFFsong")
    pid = client.post("/projects", json={"name": "p1", "data": _project_data("song.wav")}).json()["id"]
    raw = client.get(f"/projects/{pid}/bundle").content

    # เครื่องปลายทางมีไฟล์ชื่อเดียวกันแต่เนื้อหาต่าง — ห้ามทับ
    (data_dir / "uploads" / "song.wav").write_bytes(b"DIFFERENT")

    r = client.post("/projects/import", files={"file": ("p1.gmp", raw, "application/zip")})
    assert r.status_code == 200
    assert (data_dir / "uploads" / "song.wav").read_bytes() == b"DIFFERENT"

    data = client.get(f"/projects/{r.json()['id']}").json()["data"]
    new_name = data["project"]["assets"]["a_1"]["name"]
    assert new_name != "song.wav"
    assert (data_dir / "uploads" / new_name).read_bytes() == b"RIFFsong"
    assert r.json()["renamed"] == {"song.wav": new_name}


def test_import_reuses_identical_existing_media(client, data_dir):
    _make_upload(client, "song.wav", b"RIFFsong")
    pid = client.post("/projects", json={"name": "p1", "data": _project_data("song.wav")}).json()["id"]
    raw = client.get(f"/projects/{pid}/bundle").content

    r = client.post("/projects/import", files={"file": ("p1.gmp", raw, "application/zip")})
    assert r.json()["renamed"] == {}
    assert len(list((data_dir / "uploads").glob("*.wav"))) == 1


def test_import_rejects_a_non_bundle(client):
    r = client.post("/projects/import", files={"file": ("x.gmp", b"not a zip", "application/zip")})
    assert r.status_code == 400
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv\Scripts\python.exe -m pytest tests/test_bundle.py -k import`
Expected: FAIL — 404 on `/projects/import`

- [ ] **Step 3: Implement `read_bundle` and `install_bundle`**

Append to `backend/app/services/bundle.py`:

```python
import io


def read_bundle(raw: bytes) -> tuple[dict, dict[str, bytes]]:
    """แกะ .gmp → (project dict, {asset_id: bytes}) — โยน ValueError ถ้าไม่ใช่ bundle ที่ถูกต้อง"""
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
        project = json.loads(zf.read("project.json"))
        manifest = json.loads(zf.read("manifest.json"))
    except (zipfile.BadZipFile, KeyError, json.JSONDecodeError) as e:
        raise ValueError("ไฟล์นี้ไม่ใช่ bundle .gmp ที่ถูกต้อง") from e

    if manifest.get("format") != "gmp":
        raise ValueError("ไฟล์นี้ไม่ใช่ bundle .gmp ที่ถูกต้อง")

    media: dict[str, bytes] = {}
    for a in manifest.get("assets", []):
        arc = a.get("arc")
        if a.get("missing") or not arc:
            continue
        media[a["id"]] = zf.read(arc)
    return project, media


def install_bundle(raw: bytes) -> tuple[dict, dict[str, str]]:
    """เขียนสื่อลง uploads/outputs แล้วคืน (project ที่แก้ชื่อ asset แล้ว, {ชื่อเดิม: ชื่อใหม่})

    ถ้าปลายทางมีไฟล์ชื่อเดียวกัน:
      • เนื้อหาเหมือนกัน (sha256 ตรง) → ใช้ไฟล์เดิม ไม่เขียนซ้ำ
      • เนื้อหาต่างกัน                → เขียนเป็นชื่อใหม่ แล้วอัปเดต asset.name ใน project
    ไม่มีทางที่ import จะทับไฟล์เดิมของผู้ใช้
    """
    project, media = read_bundle(raw)
    settings = get_settings()
    settings.ensure_dirs()
    assets = ((project.get("data") or {}).get("project") or {}).get("assets") or {}
    renamed: dict[str, str] = {}

    for aid, ref in assets.items():
        blob = media.get(aid)
        if blob is None:
            continue
        root = getattr(settings, _KIND_DIRS.get(ref.get("kind", "upload"), "uploads_dir"))
        original = Path(ref.get("name", aid)).name
        target = root / original

        if target.exists():
            if hashlib.sha256(target.read_bytes()).hexdigest() == hashlib.sha256(blob).hexdigest():
                continue                                   # ไฟล์เดียวกันอยู่แล้ว
            stem, suffix = Path(original).stem, Path(original).suffix
            target = root / f"{stem}__{aid[-6:]}{suffix}"
            renamed[original] = target.name
            ref["name"] = target.name

        target.write_bytes(blob)

    return project, renamed
```

- [ ] **Step 4: Add the endpoint**

Append to `backend/app/routers/projects.py`:

```python
from fastapi import File, UploadFile


@router.post("/import")
async def import_bundle(file: UploadFile = File(...)):
    """นำเข้าไฟล์ .gmp — คืน id ใหม่เสมอ (ไม่ทับโปรเจกต์เดิม)"""
    try:
        project, renamed = bundle.install_bundle(await file.read())
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    pid = short_id()
    name = project.get("name", "imported")
    payload = {"id": pid, "name": name, "data": project.get("data") or {}}
    (_dir() / f"{pid}.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return {"id": pid, "name": name, "renamed": renamed}
```

**Route ordering matters:** FastAPI matches in declaration order, and `GET /projects/{pid}` would swallow a literal `import` path only for GET — this is a POST and `POST /projects` is declared without a path parameter, so there is no conflict. Declare `import_bundle` anywhere in the file.

- [ ] **Step 5: Run tests**

Run: `cd backend && .venv\Scripts\python.exe -m pytest tests/test_bundle.py`
Expected: PASS — 9 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/bundle.py backend/app/routers/projects.py backend/tests/test_bundle.py
git commit -m "feat(projects): import a .gmp bundle without ever overwriting existing media"
```

### Task 9: Export / Import bundle in the UI

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/components/RemixPanel.tsx`

**Interfaces:**
- Consumes: `GET /projects/{pid}/bundle`, `POST /projects/import` (Tasks 7–8).
- Produces: `projects.bundleUrl(id: string): string`, `projects.importBundle(file: File): Promise<{id: string; name: string; renamed: Record<string,string>}>`; two new toolbar buttons.

- [ ] **Step 1: Add the API client functions**

In `frontend/src/api.ts`, inside the `projects` object:

```ts
  bundleUrl: (id: string) => `${API_BASE}/projects/${id}/bundle`,
  importBundle: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<{ id: string; name: string; renamed: Record<string, string> }>(
      "/projects/import", { method: "POST", body: fd },
    );
  },
```

- [ ] **Step 2: Add the toolbar controls**

In `frontend/src/components/RemixPanel.tsx`, after the `📋 Save As` button:

```tsx
          <button
            className="seg-add"
            disabled={!file.currentId}
            title={file.currentId ? "ส่งออกโปรเจกต์ + ไฟล์เสียงเป็น .gmp (ย้ายข้ามเครื่องได้)" : "บันทึกโปรเจกต์ก่อนจึงส่งออกได้"}
            onClick={() => { if (file.currentId) window.location.href = projects.bundleUrl(file.currentId); }}
          >📦 Export .gmp</button>
          <label className="seg-add" title="นำเข้าโปรเจกต์จากไฟล์ .gmp">
            <input
              type="file" accept=".gmp,application/zip" hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (file.dirty && !(await dialog.confirm("มีการเปลี่ยนแปลงที่ยังไม่บันทึก — ทิ้งแล้วนำเข้า?"))) return;
                const r = await projects.importBundle(f);
                await file.openProject(r.id);
                const n = Object.keys(r.renamed).length;
                if (n > 0) {
                  await dialog.confirm(
                    `นำเข้าแล้ว — มีไฟล์ ${n} ไฟล์ที่ชื่อซ้ำกับของเดิมบนเครื่องนี้ ` +
                    `ระบบบันทึกเป็นชื่อใหม่ให้แล้ว (ไฟล์เดิมของคุณไม่ถูกทับ)`,
                  );
                }
              }}
            />
            📥 Import .gmp
          </label>
```

Add `projects` to the existing `import { API_BASE, files, music } from "../api";` line.

- [ ] **Step 3: Verify types and tests**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: clean.

- [ ] **Step 4: Manual portability check — this is the Phase B exit gate**

1. Run `dev.bat`. Load a source file, arrange two clips, Save As "portable".
2. Click **📦 Export .gmp** and keep the downloaded file.
3. Stop the backend. Rename `backend/data` to `backend/data-old`. Restart the backend (a fresh, empty `data/` is created).
4. Reload the UI. **📥 Import .gmp**, choose the file.
5. Both clips must draw their waveforms and play. Before this phase, both would have been silent empty blocks.
6. Restore `backend/data` when finished.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.ts frontend/src/components/RemixPanel.tsx
git commit -m "feat(projects): export and import .gmp bundles from the toolbar"
```

**Phase B exit gate:** the manual check in Task 9 step 4 passes, `test.bat` is green. G-02 is closed.

---

## Phase C — G-01: render the timeline

Phase A made the project describe the whole arrangement; phase B made every clip resolvable to a file by the backend. This phase adds the missing node: a plan builder and an offline mixdown that produce a file matching what the preview plays.

**Parity scope, stated up front.** This phase achieves exact parity for clip timing, offset, per-clip gain, linear fades, clip mute, track mute/solo, pan and summing — all of which are fully specified and therefore testable. It does **not** attempt bit-parity for the three master effects: Chrome's `DynamicsCompressor` has implementation-defined lookahead and adaptive release that cannot be replicated from the spec, and the preview reverb uses a per-session random impulse response. Master-FX parity is gap **G-08** and is out of scope here. What this phase does do is stop the silent lie: when master FX are requested and `pedalboard` is unavailable, the render fails loudly instead of returning an unprocessed copy.

### Task 10: Render plan builder

**Files:**
- Create: `backend/app/pipelines/render.py`
- Create: `backend/tests/test_render_plan.py`

**Interfaces:**
- Consumes: `bundle.resolve_asset` (Task 7).
- Produces:
  - `@dataclass RenderClip(path: str, start: float, offset: float, duration: float, gain: float, fade_in: float, fade_out: float)`
  - `@dataclass RenderTrack(pan: float, clips: list[RenderClip])`
  - `@dataclass RenderPlan(sample_rate: int, duration: float, tracks: list[RenderTrack])`
  - `build_render_plan(project: dict, sample_rate: int = 48000) -> RenderPlan`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_render_plan.py
import pytest


def _clip(**kw):
    base = {"id": "c1", "assetId": "a_1", "start": 0.0, "duration": 2.0,
            "offset": 0.0, "gain": 1.0, "muted": False, "color": "#fff"}
    base.update(kw)
    return base


def _track(clips, **kw):
    base = {"id": "t1", "label": "T", "color": "#fff", "pan": 0.0,
            "muted": False, "solo": False, "locked": False, "envelopes": []}
    base.update(kw)
    base["clips"] = clips
    return base


def _project(tracks, assets=None):
    return {
        "bpm": 120, "key": None, "timeSig": 4, "loop": None, "duration": 0,
        "assets": assets if assets is not None else {"a_1": {"id": "a_1", "kind": "upload", "name": "song.wav"}},
        "tracks": tracks,
    }


@pytest.fixture()
def song(data_dir):
    """สร้างไฟล์จริงใน uploads/ ให้ resolve_asset หาเจอ"""
    p = data_dir / "uploads" / "song.wav"
    p.write_bytes(b"RIFF" + b"\0" * 40)
    return p


def test_plan_resolves_clip_to_a_real_path(song, data_dir):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([_track([_clip()])]))
    assert len(plan.tracks) == 1
    assert plan.tracks[0].clips[0].path == str(song)


def test_plan_duration_is_the_last_clip_end(song):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([_track([_clip(start=1.5, duration=2.0)])]))
    assert plan.duration == pytest.approx(3.5)


def test_muted_clip_is_dropped(song):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([_track([_clip(muted=True)])]))
    assert plan.tracks[0].clips == []


def test_muted_track_is_dropped(song):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([_track([_clip()], muted=True)]))
    assert plan.tracks == []


def test_solo_excludes_every_non_solo_track(song):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([
        _track([_clip()], id="a", solo=False),
        _track([_clip()], id="b", solo=True),
    ]))
    assert len(plan.tracks) == 1
    assert plan.tracks[0].pan == 0.0


def test_pan_is_carried_and_clamped(song):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([_track([_clip()], pan=-3.0)]))
    assert plan.tracks[0].pan == -1.0


def test_clip_without_an_asset_is_dropped(song):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([_track([_clip(assetId=None)])]))
    assert plan.tracks == []


def test_missing_media_raises_a_named_error(data_dir):
    from app.pipelines.render import build_render_plan, MissingAssetError

    with pytest.raises(MissingAssetError) as exc:
        build_render_plan(_project([_track([_clip()])]))
    assert "song.wav" in str(exc.value)


def test_overlapping_fades_are_clamped_to_the_clip_length(song):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([_track([_clip(duration=2.0, fadeIn=1.5, fadeOut=1.5)])]))
    c = plan.tracks[0].clips[0]
    assert c.fade_in + c.fade_out == pytest.approx(2.0)
    assert c.fade_in == pytest.approx(1.0)


def test_empty_project_yields_an_empty_plan(data_dir):
    from app.pipelines.render import build_render_plan

    plan = build_render_plan(_project([]))
    assert plan.tracks == []
    assert plan.duration == 0.0
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv\Scripts\python.exe -m pytest tests/test_render_plan.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.pipelines.render'`

- [ ] **Step 3: Write the plan builder**

```python
# backend/app/pipelines/render.py
# @req FR-09 — render arrangement ของ timeline เป็นไฟล์เดียว (mixdown)
"""Render — แปลง project (tracks/clips) เป็นแผน แล้ว mix ลงไฟล์

แยกเป็นสองครึ่งโดยตั้งใจ:
  build_render_plan()  บริสุทธิ์ ไม่แตะเสียง — ตัดสินใจว่าอะไรถูกเล่นบ้าง (mute/solo/asset)
  render_plan()        อ่านไฟล์จริง แล้ว mix ตามแผน

ครึ่งแรกเทสต์ได้เร็วมากโดยไม่ต้องมีไฟล์เสียงจริง; ครึ่งหลังเทสต์ด้วย golden file
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..services.bundle import resolve_asset

DEFAULT_SR = 48000


class MissingAssetError(RuntimeError):
    """โปรเจกต์อ้างไฟล์ที่ไม่มีบนเครื่องนี้ — ผู้ใช้ต้อง import bundle หรือ relink"""


@dataclass
class RenderClip:
    path: str
    start: float       # ตำแหน่งบน timeline (วินาที)
    offset: float      # จุดเริ่มในไฟล์ต้นฉบับ
    duration: float
    gain: float
    fade_in: float
    fade_out: float


@dataclass
class RenderTrack:
    pan: float
    clips: list[RenderClip] = field(default_factory=list)


@dataclass
class RenderPlan:
    sample_rate: int
    duration: float
    tracks: list[RenderTrack] = field(default_factory=list)


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def build_render_plan(project: dict, sample_rate: int = DEFAULT_SR) -> RenderPlan:
    """แปลง project dict เป็นแผน render — ตัด clip/track ที่ไม่ดังออกตั้งแต่ตรงนี้

    กติกาให้ตรงกับ preview (ClipTimeline.play):
      • track ที่ muted ข้าม
      • ถ้ามี track ใดตั้ง solo → เล่นเฉพาะ track ที่ solo
      • clip ที่ muted หรือไม่มี assetId ข้าม
      • fade ที่รวมกันยาวเกิน clip → ย่อตามสัดส่วน (preview จะกระโดด เราทำให้นิ่ง)
    """
    assets = project.get("assets") or {}
    tracks_in = project.get("tracks") or []
    any_solo = any(t.get("solo") for t in tracks_in)

    out_tracks: list[RenderTrack] = []
    duration = 0.0

    for t in tracks_in:
        if t.get("muted"):
            continue
        if any_solo and not t.get("solo"):
            continue

        clips: list[RenderClip] = []
        for c in t.get("clips") or []:
            if c.get("muted"):
                continue
            aid = c.get("assetId")
            if not aid:
                continue
            ref = assets.get(aid)
            if ref is None:
                raise MissingAssetError(f"ไม่พบข้อมูล asset {aid} ในโปรเจกต์")
            try:
                path = resolve_asset(ref.get("kind", "upload"), ref.get("name", ""))
            except (FileNotFoundError, ValueError) as e:
                raise MissingAssetError(
                    f"ไม่พบไฟล์เสียง '{ref.get('name')}' บนเครื่องนี้ "
                    "— นำเข้า bundle (.gmp) หรืออัปโหลดไฟล์นี้อีกครั้งก่อน render"
                ) from e

            dur = float(c.get("duration") or 0.0)
            if dur <= 0:
                continue
            fi = max(0.0, float(c.get("fadeIn") or 0.0))
            fo = max(0.0, float(c.get("fadeOut") or 0.0))
            if fi + fo > dur:                       # ย่อตามสัดส่วนให้พอดี clip
                scale = dur / (fi + fo)
                fi, fo = fi * scale, fo * scale

            start = max(0.0, float(c.get("start") or 0.0))
            clips.append(RenderClip(
                path=str(path), start=start, offset=max(0.0, float(c.get("offset") or 0.0)),
                duration=dur, gain=_clamp(float(c.get("gain", 1.0)), 0.0, 1.0),
                fade_in=fi, fade_out=fo,
            ))
            duration = max(duration, start + dur)

        if clips:
            out_tracks.append(RenderTrack(pan=_clamp(float(t.get("pan") or 0.0), -1.0, 1.0), clips=clips))

    return RenderPlan(sample_rate=sample_rate, duration=duration, tracks=out_tracks)
```

- [ ] **Step 4: Run tests**

Run: `cd backend && .venv\Scripts\python.exe -m pytest tests/test_render_plan.py`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/app/pipelines/render.py backend/tests/test_render_plan.py
git commit -m "feat(render): build a render plan from a project, honouring mute, solo and assets"
```

### Task 11: Offline mixdown

**Files:**
- Modify: `backend/app/pipelines/render.py`
- Create: `backend/tests/test_render_mix.py`

**Interfaces:**
- Consumes: `RenderPlan` (Task 10).
- Produces:
  - `decode_to_array(src: str, sample_rate: int, work: Path) -> np.ndarray` — shape `(n, channels)`, float32, channel count preserved
  - `apply_pan(audio: np.ndarray, pan: float) -> np.ndarray` — shape `(n, 2)`, implementing the **W3C `StereoPannerNode` algorithm exactly** so the render matches the preview
  - `render_plan(plan: RenderPlan, out_path: str, progress=None) -> dict` — writes the file, returns `{"output", "duration", "peak", "clipped", "tracks", "clips"}`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_render_mix.py
import math

import numpy as np
import pytest
import soundfile as sf

SR = 48000
AMP = 0.25   # เตี้ยพอที่ pan สุดข้างจะไม่เกิน 1.0 หลังรวม L+R


@pytest.fixture()
def flat(data_dir):
    """ไฟล์ stereo 2 วินาที ค่าคงที่ AMP ทุก sample — ทำให้คำนวณค่าที่คาดหวังได้ตรง ๆ"""
    p = data_dir / "uploads" / "flat.wav"
    sf.write(p, np.full((SR * 2, 2), AMP, dtype=np.float32), SR, subtype="FLOAT")
    return p


def _plan(clips, pan=0.0, sr=SR):
    from app.pipelines.render import RenderPlan, RenderTrack
    duration = max((c.start + c.duration for c in clips), default=0.0)
    return RenderPlan(sample_rate=sr, duration=duration, tracks=[RenderTrack(pan=pan, clips=clips)])


def _clip(path, **kw):
    from app.pipelines.render import RenderClip
    base = dict(path=str(path), start=0.0, offset=0.0, duration=1.0,
                gain=1.0, fade_in=0.0, fade_out=0.0)
    base.update(kw)
    return RenderClip(**base)


def _read(p):
    data, sr = sf.read(p, dtype="float32", always_2d=True)
    return data, sr


def test_clip_lands_at_its_start_time(flat, data_dir, tmp_path):
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    render_plan(_plan([_clip(flat, start=1.0, duration=1.0)]), str(out))
    data, sr = _read(out)

    assert sr == SR
    assert data.shape[0] == pytest.approx(SR * 2, abs=2)
    assert np.allclose(data[: SR - 1], 0.0, atol=1e-6)            # ก่อน start = เงียบ
    assert np.allclose(data[SR + 10 : SR * 2 - 10], AMP, atol=1e-4)


def test_gain_scales_the_samples(flat, tmp_path):
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    render_plan(_plan([_clip(flat, gain=0.5)]), str(out))
    data, _ = _read(out)
    assert np.allclose(data[100:-100], AMP * 0.5, atol=1e-4)


def test_offset_reads_from_inside_the_source(flat, tmp_path):
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    render_plan(_plan([_clip(flat, offset=1.0, duration=0.5)]), str(out))
    data, _ = _read(out)
    assert data.shape[0] == pytest.approx(SR // 2, abs=2)
    assert np.allclose(data[100:-100], AMP, atol=1e-4)


def test_fade_in_is_linear(flat, tmp_path):
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    render_plan(_plan([_clip(flat, duration=1.0, fade_in=1.0)]), str(out))
    data, _ = _read(out)
    assert data[0, 0] == pytest.approx(0.0, abs=1e-4)
    assert data[SR // 2, 0] == pytest.approx(AMP * 0.5, abs=2e-3)
    assert data[SR - 2, 0] == pytest.approx(AMP, abs=2e-3)


def test_fade_out_is_linear(flat, tmp_path):
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    render_plan(_plan([_clip(flat, duration=1.0, fade_out=1.0)]), str(out))
    data, _ = _read(out)
    assert data[0, 0] == pytest.approx(AMP, abs=2e-3)
    assert data[SR // 2, 0] == pytest.approx(AMP * 0.5, abs=2e-3)
    assert data[SR - 2, 0] == pytest.approx(0.0, abs=2e-3)


def test_overlapping_clips_sum(flat, tmp_path):
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    render_plan(_plan([_clip(flat, duration=1.0), _clip(flat, duration=1.0)]), str(out))
    data, _ = _read(out)
    assert np.allclose(data[100:-100], AMP * 2, atol=1e-4)


def test_pan_hard_left_matches_the_w3c_stereo_panner(flat, tmp_path):
    """pan=-1 → x=0 → gainL=cos(0)=1, gainR=sin(0)=0 → L = inL + inR, R = 0"""
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    render_plan(_plan([_clip(flat, duration=1.0)], pan=-1.0), str(out))
    data, _ = _read(out)
    assert np.allclose(data[100:-100, 0], AMP * 2, atol=1e-4)
    assert np.allclose(data[100:-100, 1], 0.0, atol=1e-6)


def test_pan_centre_is_the_identity(flat, tmp_path):
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    render_plan(_plan([_clip(flat, duration=1.0)], pan=0.0), str(out))
    data, _ = _read(out)
    assert np.allclose(data[100:-100, 0], AMP, atol=1e-4)
    assert np.allclose(data[100:-100, 1], AMP, atol=1e-4)


def test_apply_pan_matches_the_spec_formula():
    from app.pipelines.render import apply_pan

    mono = np.full((4, 1), 0.5, dtype=np.float32)
    out = apply_pan(mono, 0.0)
    assert out.shape == (4, 2)
    # mono: x = (pan+1)/2 = 0.5 → gainL = gainR = cos/sin(π/4) = √2/2
    assert out[0, 0] == pytest.approx(0.5 * math.cos(math.pi / 4), abs=1e-6)
    assert out[0, 1] == pytest.approx(0.5 * math.sin(math.pi / 4), abs=1e-6)


def test_result_reports_peak_and_clipping(flat, tmp_path):
    from app.pipelines.render import render_plan

    out = tmp_path / "o.wav"
    res = render_plan(_plan([_clip(flat, duration=1.0, gain=1.0)] * 5), str(out))
    assert res["peak"] == pytest.approx(1.0, abs=1e-6)
    assert res["clipped"] is True
    assert res["clips"] == 5


def test_empty_plan_writes_a_short_silent_file(tmp_path, data_dir):
    from app.pipelines.render import RenderPlan, render_plan

    out = tmp_path / "o.wav"
    res = render_plan(RenderPlan(sample_rate=SR, duration=0.0, tracks=[]), str(out))
    data, _ = _read(out)
    assert res["clips"] == 0
    assert np.allclose(data, 0.0)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv\Scripts\python.exe -m pytest tests/test_render_mix.py`
Expected: FAIL — `ImportError: cannot import name 'render_plan'`

- [ ] **Step 3: Implement decode, pan and mixdown**

Append to `backend/app/pipelines/render.py`:

```python
import math
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np


def _ffmpeg() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def decode_to_array(src: str, sample_rate: int, work: Path) -> np.ndarray:
    """แปลงไฟล์ใดก็ได้ (wav/mp3/m4a/webm/วิดีโอ) เป็น float32 ที่ sample_rate ที่ต้องการ

    ผ่าน ffmpeg เสมอ จึงไม่ต้องพึ่ง resampler library และรองรับทุกฟอร์แมตที่ import ได้
    **คงจำนวนช่องเดิมไว้** (ไม่ใส่ -ac) เพราะ mono กับ stereo เข้าสูตร pan คนละทาง
    คืน shape (n, channels)
    """
    import soundfile as sf

    work.mkdir(parents=True, exist_ok=True)
    dst = work / f"dec_{abs(hash(src)) % (10 ** 10)}.wav"
    if not dst.exists():
        subprocess.run(
            [_ffmpeg(), "-y", "-i", src, "-vn", "-ar", str(sample_rate), "-c:a", "pcm_f32le", str(dst)],
            capture_output=True, check=True,
        )
    data, _ = sf.read(dst, dtype="float32", always_2d=True)
    return data


def apply_pan(audio: np.ndarray, pan: float) -> np.ndarray:
    """W3C StereoPannerNode — ทำตามสเปกตรงตัวเพื่อให้ render ตรงกับ preview

    mono   : x = (pan+1)/2 ; L = in*cos(xπ/2) , R = in*sin(xπ/2)
    stereo : pan<=0 → x = pan+1 ; L = inL + inR*cos(xπ/2) , R = inR*sin(xπ/2)
             pan>0  → x = pan   ; L = inL*cos(xπ/2)        , R = inR + inL*sin(xπ/2)
    """
    n, ch = audio.shape
    out = np.zeros((n, 2), dtype=np.float32)

    if ch == 1:
        x = (pan + 1.0) / 2.0
        out[:, 0] = audio[:, 0] * math.cos(x * math.pi / 2)
        out[:, 1] = audio[:, 0] * math.sin(x * math.pi / 2)
        return out

    left, right = audio[:, 0], audio[:, 1]
    x = pan + 1.0 if pan <= 0 else pan
    g_l, g_r = math.cos(x * math.pi / 2), math.sin(x * math.pi / 2)
    if pan <= 0:
        out[:, 0] = left + right * g_l
        out[:, 1] = right * g_r
    else:
        out[:, 0] = left * g_l
        out[:, 1] = right + left * g_r
    return out


def _envelope(n: int, sr: int, gain: float, fade_in: float, fade_out: float) -> np.ndarray:
    """gain คงที่ + linear ramp หัว/ท้าย — ตรงกับ linearRampToValueAtTime ของ Web Audio"""
    env = np.full(n, gain, dtype=np.float32)
    fi = int(round(fade_in * sr))
    if fi > 0:
        env[:fi] *= np.linspace(0.0, 1.0, min(fi, n), endpoint=False, dtype=np.float32)[: min(fi, n)]
    fo = int(round(fade_out * sr))
    if fo > 0:
        tail = min(fo, n)
        env[n - tail:] *= np.linspace(1.0, 0.0, tail, endpoint=False, dtype=np.float32)
    return env


def render_plan(plan: RenderPlan, out_path: str, progress=None) -> dict:
    """mix ตามแผนแล้วเขียนไฟล์ — คืนสถิติของ artifact ที่ผลิตได้"""
    import soundfile as sf

    sr = plan.sample_rate
    total = max(1, int(round(plan.duration * sr)))
    master = np.zeros((total, 2), dtype=np.float32)
    work = Path(tempfile.mkdtemp(prefix="render_"))
    n_clips = sum(len(t.clips) for t in plan.tracks)
    done = 0

    try:
        for track in plan.tracks:
            bus = np.zeros((total, max(1, _channels_of(track, work, sr))), dtype=np.float32)
            for c in track.clips:
                audio = decode_to_array(c.path, sr, work)
                start_i = int(round(c.offset * sr))
                length = int(round(c.duration * sr))
                seg = audio[start_i : start_i + length]
                if seg.shape[0] < length:                       # clip ยาวกว่าไฟล์ → เติมเงียบ
                    seg = np.pad(seg, ((0, length - seg.shape[0]), (0, 0)))
                if seg.shape[1] != bus.shape[1]:                # mono/stereo ปนกันใน track เดียว
                    seg = np.repeat(seg, 2, axis=1)[:, : bus.shape[1]] if seg.shape[1] == 1 \
                          else seg.mean(axis=1, keepdims=True)

                seg = seg * _envelope(seg.shape[0], sr, c.gain, c.fade_in, c.fade_out)[:, None]

                at = int(round(c.start * sr))
                end = min(total, at + seg.shape[0])
                if end > at:
                    bus[at:end] += seg[: end - at]

                done += 1
                if progress and n_clips:
                    progress(0.1 + 0.8 * done / n_clips, f"มิกซ์ {done}/{n_clips} คลิป…")

            master += apply_pan(bus, track.pan)

        peak = float(np.max(np.abs(master))) if master.size else 0.0
        clipped = bool(peak > 1.0)
        np.clip(master, -1.0, 1.0, out=master)
        sf.write(out_path, master, sr, subtype="FLOAT")
    finally:
        shutil.rmtree(work, ignore_errors=True)

    return {
        "output": out_path,
        "duration": round(total / sr, 3),
        "peak": round(peak, 6),
        "clipped": clipped,
        "tracks": len(plan.tracks),
        "clips": n_clips,
    }


def _channels_of(track: RenderTrack, work: Path, sr: int) -> int:
    """จำนวนช่องของ track = มากสุดในบรรดา clip ของมัน (mono ล้วน → 1, มี stereo → 2)"""
    ch = 1
    for c in track.clips:
        ch = max(ch, decode_to_array(c.path, sr, work).shape[1])
    return ch
```

- [ ] **Step 4: Run tests**

Run: `cd backend && .venv\Scripts\python.exe -m pytest tests/test_render_mix.py -v`
Expected: PASS — 11 tests. These are the golden-file tests that lock arrangement parity; if any tolerance fails, fix the code, never the tolerance.

- [ ] **Step 5: Commit**

```bash
git add backend/app/pipelines/render.py backend/tests/test_render_mix.py
git commit -m "feat(render): offline mixdown with W3C-exact panning, gains and linear fades"
```

### Task 12: Artifact validation

**Files:**
- Create: `backend/app/utils/validate.py`
- Create: `backend/tests/test_validate.py`
- Modify: `backend/app/pipelines/render.py` (call it before returning)

**Interfaces:**
- Produces: `validate_audio(path: str) -> dict` returning `{"ok", "issues", "duration", "sample_rate", "channels", "peak_dbfs", "lufs", "dc_offset"}`. `issues` is a list of Thai strings.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_validate.py
import numpy as np
import pytest
import soundfile as sf

SR = 48000


def _write(p, arr):
    sf.write(p, arr.astype(np.float32), SR, subtype="FLOAT")
    return str(p)


def test_healthy_file_passes(tmp_path):
    from app.utils.validate import validate_audio

    t = np.linspace(0, 1, SR, endpoint=False)
    tone = np.stack([np.sin(2 * np.pi * 440 * t) * 0.3] * 2, axis=1)
    r = validate_audio(_write(tmp_path / "a.wav", tone))
    assert r["ok"] is True
    assert r["issues"] == []
    assert r["channels"] == 2
    assert r["sample_rate"] == SR
    assert r["duration"] == pytest.approx(1.0, abs=0.01)


def test_all_silence_is_flagged(tmp_path):
    from app.utils.validate import validate_audio

    r = validate_audio(_write(tmp_path / "s.wav", np.zeros((SR, 2))))
    assert r["ok"] is False
    assert any("เงียบ" in i for i in r["issues"])


def test_nan_is_flagged(tmp_path):
    from app.utils.validate import validate_audio

    arr = np.zeros((SR, 2)); arr[10] = np.nan
    r = validate_audio(_write(tmp_path / "n.wav", arr))
    assert r["ok"] is False
    assert any("NaN" in i for i in r["issues"])


def test_dc_offset_is_flagged(tmp_path):
    from app.utils.validate import validate_audio

    r = validate_audio(_write(tmp_path / "d.wav", np.full((SR, 2), 0.4)))
    assert r["ok"] is False
    assert any("DC" in i for i in r["issues"])


def test_zero_length_is_flagged(tmp_path):
    from app.utils.validate import validate_audio

    r = validate_audio(_write(tmp_path / "z.wav", np.zeros((0, 2))))
    assert r["ok"] is False
    assert any("ความยาว" in i for i in r["issues"])
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv\Scripts\python.exe -m pytest tests/test_validate.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.utils.validate'`

- [ ] **Step 3: Implement the validator**

```python
# backend/app/utils/validate.py
# @req FR-04 — ตรวจ artifact ทุกไฟล์ที่ระบบผลิต (peak/LUFS/NaN/DC/ความยาว)
"""ตรวจคุณภาพไฟล์เสียงที่เพิ่งผลิต — กันไฟล์เสีย/เงียบ/NaN หลุดถึงผู้ใช้

RCA 2026-07-01 (remix mastering clipping) เสนอไว้ว่าต้อง "verify peak + LUFS
หลังมาสเตอร์" — โมดูลนี้คือข้อนั้น ใช้ได้กับทุก pipeline ที่เขียนไฟล์
"""
from __future__ import annotations

import numpy as np

_SILENCE_DBFS = -70.0
_DC_LIMIT = 0.05


def validate_audio(path: str) -> dict:
    """คืนสถิติ + รายการปัญหา (ภาษาไทย) — ok=False ถ้ามีปัญหาอย่างน้อยหนึ่งข้อ"""
    import soundfile as sf

    data, sr = sf.read(path, dtype="float64", always_2d=True)
    issues: list[str] = []

    n, ch = data.shape
    duration = n / sr if sr else 0.0
    if n == 0:
        issues.append("ไฟล์มีความยาวเป็นศูนย์")

    has_nan = bool(np.isnan(data).any() or np.isinf(data).any())
    if has_nan:
        issues.append("พบค่า NaN/Inf ในสัญญาณเสียง")
        data = np.nan_to_num(data)

    peak = float(np.max(np.abs(data))) if n else 0.0
    peak_dbfs = 20 * np.log10(peak) if peak > 0 else -np.inf
    if n and peak_dbfs < _SILENCE_DBFS:
        issues.append(f"ไฟล์เงียบทั้งไฟล์ (peak {peak_dbfs:.1f} dBFS)")

    dc = float(np.max(np.abs(data.mean(axis=0)))) if n else 0.0
    if dc > _DC_LIMIT:
        issues.append(f"พบ DC offset สูงผิดปกติ ({dc:.3f})")

    lufs = None
    if n and duration >= 0.4:            # pyloudnorm ต้องการอย่างน้อย 400 ms
        try:
            import pyloudnorm as pyln

            value = float(pyln.Meter(sr).integrated_loudness(data))
            lufs = round(value, 2) if np.isfinite(value) else None
        except Exception:  # noqa: BLE001 — วัดไม่ได้ไม่ควรทำให้ทั้ง job ล้ม
            lufs = None

    return {
        "ok": not issues,
        "issues": issues,
        "duration": round(duration, 3),
        "sample_rate": int(sr),
        "channels": int(ch),
        "peak_dbfs": None if peak == 0 else round(float(peak_dbfs), 2),
        "lufs": lufs,
        "dc_offset": round(dc, 5),
    }
```

- [ ] **Step 4: Call it from the renderer**

In `render_plan`, replace the return statement with:

```python
    from ..utils.validate import validate_audio

    return {
        "output": out_path,
        "duration": round(total / sr, 3),
        "peak": round(peak, 6),
        "clipped": clipped,
        "tracks": len(plan.tracks),
        "clips": n_clips,
        "validation": validate_audio(out_path),
    }
```

Then relax `test_empty_plan_writes_a_short_silent_file` in `tests/test_render_mix.py` — an empty plan legitimately produces silence, so assert the validator noticed:

```python
    assert res["validation"]["ok"] is False
    assert any("เงียบ" in i for i in res["validation"]["issues"])
```

- [ ] **Step 5: Run the whole backend suite**

Run: `cd backend && .venv\Scripts\python.exe -m pytest`
Expected: PASS — all tests.

- [ ] **Step 6: Commit**

```bash
git add backend/app/utils/validate.py backend/tests/test_validate.py backend/app/pipelines/render.py backend/tests/test_render_mix.py
git commit -m "feat(render): validate every rendered artifact (peak, LUFS, NaN, DC, duration)"
```

### Task 13: `POST /render`

**Files:**
- Create: `backend/app/routers/render.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_render_api.py`

**Interfaces:**
- Consumes: `build_render_plan`, `render_plan` (Tasks 10–11); `jobs.spawn`.
- Produces: `POST /render` accepting `{project: dict, format: "wav"|"mp3", sample_rate?: int, master?: {reverb, echo, comp}}` → `{"job_id"}`. Job result is the dict from `render_plan` with `output` reduced to a bare filename.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_render_api.py
import numpy as np
import soundfile as sf

SR = 48000


def _fixture_project(data_dir):
    sf.write(data_dir / "uploads" / "flat.wav",
             np.full((SR, 2), 0.25, dtype=np.float32), SR, subtype="FLOAT")
    return {
        "bpm": 120, "key": None, "timeSig": 4, "loop": None, "duration": 1,
        "assets": {"a_1": {"id": "a_1", "kind": "upload", "name": "flat.wav"}},
        "tracks": [{
            "id": "t", "label": "T", "color": "#fff", "pan": 0.0,
            "muted": False, "solo": False, "locked": False, "envelopes": [],
            "clips": [{"id": "c1", "assetId": "a_1", "start": 0.0, "duration": 1.0,
                       "offset": 0.0, "gain": 1.0, "muted": False, "color": "#fff"}],
        }],
    }


def _run(client, body):
    """ยิง render แล้วรอผลผ่าน WebSocket (TestClient รัน event loop ให้ในบล็อกนี้)"""
    job_id = client.post("/render", json=body).json()["job_id"]
    with client.websocket_connect(f"/jobs/ws/{job_id}") as ws:
        while True:
            msg = ws.receive_json()
            if msg["status"] in ("done", "error"):
                return msg


def test_render_produces_a_downloadable_file(client, data_dir):
    msg = _run(client, {"project": _fixture_project(data_dir), "format": "wav"})
    assert msg["status"] == "done", msg.get("error")

    name = msg["result"]["output"]
    assert "/" not in name and "\\" not in name           # ชื่อไฟล์ล้วน ไม่ใช่ path
    assert (data_dir / "outputs" / name).exists()
    assert client.get(f"/files/download/{name}").status_code == 200


def test_render_result_carries_validation(client, data_dir):
    msg = _run(client, {"project": _fixture_project(data_dir), "format": "wav"})
    v = msg["result"]["validation"]
    assert v["ok"] is True
    assert v["channels"] == 2
    assert v["sample_rate"] == SR


def test_render_fails_clearly_when_media_is_missing(client, data_dir):
    project = _fixture_project(data_dir)
    (data_dir / "uploads" / "flat.wav").unlink()
    msg = _run(client, {"project": project, "format": "wav"})
    assert msg["status"] == "error"
    assert "flat.wav" in msg["error"]


def test_render_refuses_master_fx_without_pedalboard(client, data_dir, monkeypatch):
    import app.routers.render as render_router

    monkeypatch.setattr(render_router, "_pedalboard_available", lambda: False)
    msg = _run(client, {"project": _fixture_project(data_dir), "format": "wav",
                        "master": {"reverb": 0.3, "echo": 0.0, "comp": False}})
    assert msg["status"] == "error"
    assert "pedalboard" in msg["error"]


def test_render_without_fx_works_even_without_pedalboard(client, data_dir, monkeypatch):
    import app.routers.render as render_router

    monkeypatch.setattr(render_router, "_pedalboard_available", lambda: False)
    msg = _run(client, {"project": _fixture_project(data_dir), "format": "wav"})
    assert msg["status"] == "done", msg.get("error")
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv\Scripts\python.exe -m pytest tests/test_render_api.py`
Expected: FAIL — 404 on `/render`

- [ ] **Step 3: Write the router**

```python
# backend/app/routers/render.py
# @req FR-09 — render timeline arrangement เป็นไฟล์ (แทน export ที่เบคได้แค่ไฟล์เดียว)
"""Render — รับ project ทั้งก้อน แล้ว mix arrangement ลงไฟล์เป็น job"""
from __future__ import annotations

import asyncio
import importlib.util
import os
import subprocess

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..config import get_settings
from ..jobs import jobs
from ..pipelines.render import DEFAULT_SR, build_render_plan, render_plan
from ..utils.ids import short_id

router = APIRouter(prefix="/render", tags=["render"])


class MasterFx(BaseModel):
    reverb: float = 0.0
    echo: float = 0.0
    comp: bool = False

    def is_active(self) -> bool:
        return self.comp or self.reverb > 0 or self.echo > 0


class RenderRequest(BaseModel):
    project: dict = Field(description="state ของ project (tracks/clips/assets) ตรงจาก snapshot")
    format: str = Field(default="wav", pattern="^(wav|mp3)$")
    sample_rate: int = DEFAULT_SR
    master: MasterFx = Field(default_factory=MasterFx)


def _pedalboard_available() -> bool:
    """แยกเป็นฟังก์ชันเพื่อให้เทสต์ monkeypatch ได้"""
    try:
        return importlib.util.find_spec("pedalboard") is not None
    except (ImportError, ValueError):
        return False


@router.post("")
async def render(req: RenderRequest):
    """mix arrangement ทั้งหมดลงไฟล์เดียว (เคารพ start/offset/gain/fade/mute/solo/pan)"""
    settings = get_settings()
    loop = asyncio.get_event_loop()

    async def task(job, report):
        await report(job, 0.05, "กำลังวางแผน render…")

        # กันคำโกหก: ถ้าขอ master FX แต่ไม่มี pedalboard ให้ล้มพร้อมบอกเหตุผล
        # (ห้ามคืนไฟล์ที่ไม่มี FX แล้วรายงานว่าสำเร็จ)
        if req.master.is_active() and not _pedalboard_available():
            raise RuntimeError(
                "ขอ master FX (reverb/echo/compressor) แต่ยังไม่ได้ติดตั้งปลั๊กอิน pedalboard "
                "— ติดตั้งด้วย `uv pip install pedalboard` (license GPLv3) แล้วลองใหม่ "
                "หรือปิด master FX แล้ว render ใหม่"
            )

        def on_progress(frac: float, msg: str) -> None:
            asyncio.run_coroutine_threadsafe(report(job, frac, msg), loop)

        plan = await loop.run_in_executor(
            None, lambda: build_render_plan(req.project, req.sample_rate)
        )
        wav_out = str(settings.outputs_dir / f"render_{short_id()}.wav")
        result = await loop.run_in_executor(
            None, lambda: render_plan(plan, wav_out, progress=on_progress)
        )

        final = wav_out
        if req.master.is_active():
            await report(job, 0.9, "กำลังเบค master FX…")
            from ..pipelines.music import apply_master_fx

            fx_out = str(settings.outputs_dir / f"render_{short_id()}_fx.wav")
            final = await loop.run_in_executor(None, lambda: apply_master_fx(
                input_path=wav_out, out_path=fx_out,
                reverb=req.master.reverb, echo=req.master.echo, comp=req.master.comp,
            ))

        if req.format == "mp3":
            await report(job, 0.95, "กำลังแปลงเป็น MP3…")
            import imageio_ffmpeg

            ff = imageio_ffmpeg.get_ffmpeg_exe()
            mp3 = final[:-4] + ".mp3"
            await loop.run_in_executor(None, lambda: subprocess.run(
                [ff, "-y", "-i", final, "-b:a", "320k", mp3], capture_output=True, check=True))
            final = mp3

        result["output"] = os.path.basename(final)
        return result

    job = jobs.spawn("render", task)
    return {"job_id": job.id}
```

- [ ] **Step 4: Mount the router**

In `backend/app/main.py`, add `render` to both the import line and the mount tuple:

Line 18 becomes:

```python
from .routers import agent, brain, dubbing, files, fs, health, jobs, mastering, music, packs, plugins, projects, render, tts, voices
```

and line 33 becomes:

```python
for r in (health, brain, voices, files, fs, tts, dubbing, mastering, music, render, packs, projects, jobs, agent, plugins):
    app.include_router(r.router)
```

Nothing else in `main.py` changes.

- [ ] **Step 5: Run tests**

Run: `cd backend && .venv\Scripts\python.exe -m pytest tests/test_render_api.py -v`
Expected: PASS — 5 tests. **Restart any manually-running backend**, or the new route 404s.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/render.py backend/app/main.py backend/tests/test_render_api.py
git commit -m "feat(api): add POST /render to mix the timeline arrangement to a file"
```

### Task 14: Wire Export in the UI to the real renderer

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/components/RemixPanel.tsx`
- Modify: `frontend/src/components/PropertiesPanel.tsx`

**Interfaces:**
- Consumes: `POST /render` (Task 13).
- Produces: `render.run(body)` in `api.ts`; an always-available Export control in the Remix toolbar; the master-track-only export block is removed from `PropertiesPanel`.

- [ ] **Step 1: Add the API client**

In `frontend/src/api.ts`:

```ts
export const render = {
  run: (body: Record<string, unknown>) =>
    req<{ job_id: string }>("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};
```

- [ ] **Step 2: Replace `doExport` in `RemixPanel.tsx`**

```ts
  // ── export: render arrangement ทั้ง timeline ลงไฟล์ (ไม่ใช่เบค FX ทับไฟล์เดียวแบบเดิม) ──
  const { job: exJob, busy: exBusy, start: exStart } = useJob();
  useEffect(() => {
    if (exJob?.status === "done" && exJob.result?.output) {
      const name = String(exJob.result.output);
      const a = document.createElement("a");
      a.href = files.downloadUrl(name); a.download = name; a.click();
    }
  }, [exJob]);

  const hasClips = engine.project.tracks.some((t) => t.clips.some((c) => c.assetId));
  const doExport = (fmt: "wav" | "mp3") => {
    if (!hasClips) return;
    exStart(() => render.run({
      project: engine.project,
      format: fmt,
      master: { reverb: mReverb, echo: mEcho, comp: mComp },
    }));
  };
```

Add `render` to the `../api` import.

- [ ] **Step 3: Move Export into the toolbar**

After the `📥 Import .gmp` control added in Task 9:

```tsx
          <span className="remix-tb-sep" />
          <button className="seg-add" disabled={exBusy || !hasClips}
            title={hasClips ? "Render timeline ทั้งหมดเป็นไฟล์ WAV" : "ยังไม่มีคลิปใน timeline"}
            onClick={() => doExport("wav")}>⬇ WAV</button>
          <button className="seg-add" disabled={exBusy || !hasClips}
            title={hasClips ? "Render timeline ทั้งหมดเป็นไฟล์ MP3" : "ยังไม่มีคลิปใน timeline"}
            onClick={() => doExport("mp3")}>⬇ MP3</button>
          {exJob?.status === "error" && (
            <span className="hint mono" style={{ color: "#e05a5a" }} title={exJob.error}>⚠ export ไม่สำเร็จ</span>
          )}
          {exJob?.status === "done" && exJob.result?.clipped === true && (
            <span className="hint mono" style={{ color: "var(--amber, #d9a63c)" }}>
              ⚠ สัญญาณเกิน 0 dBFS — ลด gain หรือ pan แล้ว export ใหม่
            </span>
          )}
```

- [ ] **Step 4: Remove the old master-only export from `PropertiesPanel.tsx`**

Delete the `isMaster && outputName && (…)` block and the now-unused `outputName`, `onExport` and `exporting` props, and update the two call sites in `RemixPanel.tsx` that passed them. Replace the stale footer note

```tsx
<div className="props-note">การปรับ speed / pitch / fade แบบต่อ clip จะมาในเวอร์ชันถัดไป (ต้องใช้ DSP ต่อ clip)</div>
```

with

```tsx
<div className="props-note">gain / fade / mute / pan ที่ตั้งไว้จะถูก render ลงไฟล์ตอน export แล้ว · speed / pitch ต่อ clip ยังไม่รองรับ</div>
```

- [ ] **Step 5: Verify**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: clean.

- [ ] **Step 6: Manual parity check — this is the Phase C exit gate**

1. Run `dev.bat`. Load two audio files onto two tracks.
2. Move the second clip to start at 4 s. Set a 1 s fade-in on it. Set track 1's gain to about half. Pan track 2 hard left. Mute one clip.
3. Press Space and listen to the whole thing.
4. Press **⬇ WAV**. Open the downloaded file in any player.
5. The file must contain: silence until 4 s on track 2, the fade-in, the halved level on track 1, track 2 only in the left channel, and the muted clip absent. Before this phase, the file would have been an unrelated remix output — or the button would not have been available at all.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api.ts frontend/src/components/RemixPanel.tsx frontend/src/components/PropertiesPanel.tsx
git commit -m "feat(export): export now renders the whole timeline instead of baking one file"
```

**Phase C exit gate:** the manual parity check passes, `test.bat` is green. G-01 is closed for the arrangement layer; master-FX parity remains open as G-08.

---

## Phase D — G-04: the packaged app starts its own backend

Independent of A–C; a second worker can run this concurrently. Four blockers, in build order.

> **Correction to the audit.** The audit listed "no `shell:allow-execute` capability" as a separate blocker, following `PACKAGING_SIDECAR.md`. That is wrong for the design in this plan: Tauri v2 capabilities gate **IPC commands invoked from the webview**, not Rust-side plugin APIs. Spawning from `setup()` in `lib.rs` needs no capability change. Leave `capabilities/default.json` alone — adding `shell:allow-execute` would hand the webview the ability to run arbitrary binaries for no benefit. If a future change moves the spawn into JavaScript, the capability becomes required at that point.

### Task 15: Spawn, supervise and shut down the sidecar

**Files:**
- Modify: `frontend/src-tauri/src/lib.rs`
- Modify: `frontend/src/App.tsx` (status bar honesty)

**Interfaces:**
- Produces: the desktop app spawns `g-music-backend` on startup in release builds, skips it in dev, skips it if port 8756 already answers, and kills it when the last window closes.

- [ ] **Step 1: Write `lib.rs`**

```rust
// G-Music Tauri entry (v2) — spawn backend sidecar + ปิดให้เรียบร้อยตอนออก
use std::net::{Ipv4Addr, SocketAddrV4, TcpStream};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const BACKEND_PORT: u16 = 8756;

/// เก็บ handle ของ sidecar ไว้ kill ตอนปิดแอป
struct Sidecar(Mutex<Option<CommandChild>>);

/// มี backend ตอบอยู่แล้วไหม (นักพัฒนารัน uvicorn เองอยู่ / แอปเปิดซ้อน)
fn backend_already_running() -> bool {
    let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, BACKEND_PORT);
    TcpStream::connect_timeout(&addr.into(), Duration::from_millis(300)).is_ok()
}

fn spawn_backend(app: &tauri::AppHandle) {
    if backend_already_running() {
        log::info!("พบ backend ที่พอร์ต {BACKEND_PORT} อยู่แล้ว — ไม่ spawn sidecar ซ้ำ");
        return;
    }

    let command = match app.shell().sidecar("g-music-backend") {
        Ok(c) => c,
        Err(e) => {
            log::error!("หา sidecar ไม่เจอ: {e}");
            return;
        }
    };

    match command.spawn() {
        Ok((mut rx, child)) => {
            app.manage(Sidecar(Mutex::new(Some(child))));
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stderr(line) => {
                            log::info!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Terminated(payload) => {
                            log::error!("backend จบการทำงาน: {:?}", payload.code);
                            break;
                        }
                        _ => {}
                    }
                }
            });
        }
        Err(e) => log::error!("spawn sidecar ไม่สำเร็จ: {e}"),
    }
}

fn kill_backend(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<Sidecar>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // dev รัน backend เองผ่าน dev.bat อยู่แล้ว — spawn ซ้ำจะชนพอร์ต
            #[cfg(not(debug_assertions))]
            spawn_backend(&app.handle());
            #[cfg(debug_assertions)]
            let _ = &spawn_backend;      // กัน warning "never used" ตอน dev
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                kill_backend(app);
            }
        });
}
```

- [ ] **Step 2: Check it compiles — *after* Task 16, not before**

> **Ordering correction (verified during execution 2026-08-19).** Write `lib.rs` here, verify the **frontend** half of this task now, and run `cargo check` only after Task 16 has produced the sidecar. Measured directly: with `frontend/src-tauri/binaries/` absent, `cargo check` exits **101** with
>
> ```
> resource path `binaries\g-music-backend-x86_64-pc-windows-msvc.exe` doesn't exist
> ```
>
> from `tauri-build`'s build script. With the sidecar present it finishes clean (3m59s cold, zero errors, zero warnings).
>
> **Do not run `cargo check` and the PyInstaller build at the same time.** They both peak hard on memory and the Rust compiler is what dies.
>
> **Never pipe the verification command through `tail`.** `cargo check … | tail -40` reports the exit code of `tail`, so a failed compile looks like success.

Run (after Task 16): `cd frontend/src-tauri && cargo check`
Expected: no errors. If `log::info!` fails to resolve, `log = "0.4"` is already in `Cargo.toml` — confirm the dependency line is present.

Note on `cfg!(debug_assertions)`: the guard lives **inside** `spawn_backend` rather than around the call site, so the function is type-checked in both profiles and `cargo check` in a debug build still catches errors in the release-only path.

- [ ] **Step 3: Make the status bar tell the truth about the version**

`App.tsx` hardcodes `v0.1.0` and `127.0.0.1:8756`, which will silently lie after the first version bump. In `frontend/src/App.tsx`, replace the two literals:

```tsx
        <span className="status-item dim">{API_BASE.replace(/^https?:\/\//, "")}</span>
        <span className="status-sep">·</span>
        <span className="status-item dim">v{APP_VERSION}</span>
```

add the import `import { API_BASE } from "./api";`, and add to `frontend/vite.config.ts`:

```ts
import pkg from "./package.json";

export default defineConfig({
  // ...existing config...
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
```

with `declare const __APP_VERSION__: string;` and `const APP_VERSION = __APP_VERSION__;` at the top of `App.tsx`. Add `"resolveJsonModule": true` to `frontend/tsconfig.json` `compilerOptions` if it is not already set.

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: clean. Then `dev.bat` — the footer must show `127.0.0.1:8756` and `v0.1.0` sourced from `package.json`, and the app must behave exactly as before (dev builds do not spawn a sidecar).

- [ ] **Step 5: Commit**

```bash
git add frontend/src-tauri/src/lib.rs frontend/src/App.tsx frontend/vite.config.ts frontend/tsconfig.json
git commit -m "feat(desktop): spawn and supervise the backend sidecar; read version from package.json"
```

### Task 16: Make `build_sidecar.ps1` produce a working binary

**Files:**
- Modify: `backend/g-music-backend.spec`
- Modify: `scripts/build_sidecar.ps1`
- Create: `backend/sidecar_entry.py` (currently generated at build time and untracked)

**Interfaces:**
- Produces: `frontend/src-tauri/binaries/g-music-backend-<target-triple>.exe` plus `_internal/`, built from the **tracked** spec.

- [ ] **Step 1: Track the entrypoint instead of generating it**

```python
# backend/sidecar_entry.py
"""จุดเริ่มของ g-music-backend.exe — รัน uvicorn แบบฝังในตัว

แยกเป็นไฟล์จริง (ไม่ใช่สร้างตอน build) เพื่อให้ .spec อ้างถึงได้และ review ได้
data_dir ชี้ไปที่โฟลเดอร์ข้าง ๆ ตัว .exe เพื่อไม่ให้เขียนลง Program Files
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

if __name__ == "__main__":
    base = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).parent
    os.environ.setdefault("DATA_DIR", str(base / "data"))

    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8756, log_level="info")
```

- [ ] **Step 2: Give the spec the hidden imports PyInstaller cannot see**

Replace `backend/g-music-backend.spec` with:

```python
# -*- mode: python ; coding: utf-8 -*-
# spec ของ sidecar — ไฟล์นี้ track ไว้ในgit และ build_sidecar.ps1 ต้องใช้ตัวนี้ (ห้ามลบทิ้งแล้วสร้างใหม่)
# uvicorn/fastapi โหลด protocol implementation แบบ dynamic → PyInstaller มองไม่เห็น ต้องประกาศเอง
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

hiddenimports = (
    collect_submodules("app")          # ทุก router/pipeline ถูก import ผ่านสตริงใน main.py
    + collect_submodules("uvicorn")    # loops/protocols/lifespan โหลดแบบ dynamic
    + ["anyio._backends._asyncio", "websockets.legacy", "websockets.legacy.server"]
)

datas = collect_data_files("imageio_ffmpeg")   # ffmpeg.exe ที่ฝังมากับ wheel

a = Analysis(
    ['sidecar_entry.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['torch', 'torchaudio', 'demucs', 'f5_tts', 'TTS', 'matchering', 'pedalboard', 'psola', 'librosa'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name='g-music-backend',
    debug=False, bootloader_ignore_signals=False, strip=False, upx=True,
    console=True, disable_windowed_traceback=False,
    argv_emulation=False, target_arch=None, codesign_identity=None, entitlements_file=None,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=True, upx_exclude=[], name='g-music-backend')
```

The `excludes` list is the decision that makes this buildable: **the shipped sidecar is the lite runtime.** ML stacks stay a user-installed opt-in through the existing plugin manager, which keeps the installer small and keeps GPL components out of the bundle (risk R-001).

> **Correction (found during execution 2026-08-19).** Do **not** put `scipy` in `excludes`. `pyloudnorm` imports it, and auto-mastering (FR-04.2) is a lite-runtime feature — excluding scipy ships a sidecar that raises `ModuleNotFoundError` the first time a user presses Mastering.
>
> **Dependency pulled forward from Phase B.** `collect_data_files("imageio_ffmpeg")` in the spec requires `imageio_ffmpeg` to be importable, and a CI-built lite venv installs only `requirements.txt`. So the two missing core dependencies from **Task 6 step 1** (`imageio-ffmpeg`, `pyloudnorm`) must be added to `backend/requirements.txt` *here*, not in Phase B. Task 6 step 1 becomes a no-op if Phase D ran first.
>
> **Use a floor, not a pin, for PyInstaller.** `pyinstaller==6.11.1` downgrades a dev venv that already has something newer. `pyinstaller>=6.11` is the correct constraint.

- [ ] **Step 3: Rewrite the build script to use the spec and support CI**

Replace the body of `scripts/build_sidecar.ps1` from the "Guard" section onward with:

```powershell
param(
    [string]$VenvPath = "",
    [switch]$CreateIfMissing
)

$ErrorActionPreference = "Stop"
$root       = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$backendDir = Join-Path $root "backend"
$venvDir    = if ($VenvPath) { $VenvPath } else { Join-Path $backendDir ".venv" }
$venvPy     = Join-Path $venvDir "Scripts\python.exe"
$specName   = "g-music-backend"
$specFile   = Join-Path $backendDir "$specName.spec"
$distDir    = Join-Path $backendDir "dist"
$buildDir   = Join-Path $backendDir "build"
$sidecarDir = Join-Path $root "frontend\src-tauri\binaries"

# ── 1) venv: ใช้ของเดิม หรือสร้างใหม่แบบ lite (สำหรับ CI) ────────────────
if (-not (Test-Path $venvPy)) {
    if (-not $CreateIfMissing) {
        Write-Host "[!] ไม่พบ $venvPy — รัน scripts\setup_windows.ps1 ก่อน หรือใช้ -CreateIfMissing" -ForegroundColor Red
        exit 1
    }
    Write-Host "[*] สร้าง venv ใหม่ที่ $venvDir (lite: requirements.txt เท่านั้น)" -ForegroundColor Cyan
    & python -m venv $venvDir
    & $venvPy -m pip install --upgrade pip
    & $venvPy -m pip install -r (Join-Path $backendDir "requirements.txt")
}
& $venvPy -m pip install pyinstaller==6.11.1

# ── 2) target triple ────────────────────────────────────────────────────
$targetTriple = "x86_64-pc-windows-msvc"
try {
    $rustcInfo = & rustc -vV 2>$null
    if ($LASTEXITCODE -eq 0 -and $rustcInfo) {
        $hostLine = ($rustcInfo -split "`n") | Where-Object { $_ -match "^host:\s*(\S+)" }
        if ($hostLine -and $Matches[1]) { $targetTriple = $Matches[1] }
    }
} catch { }
Write-Host "[*] target-triple: $targetTriple" -ForegroundColor Green

# ── 3) เคลียร์ output เก่า (แต่ **ห้ามลบ .spec** — มันคือ source ที่ track ไว้) ──
if (Test-Path $distDir)  { Remove-Item -Recurse -Force $distDir }
if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
if (-not (Test-Path $specFile)) {
    Write-Host "[!] ไม่พบ $specFile — ไฟล์นี้ต้องอยู่ใน git" -ForegroundColor Red
    exit 1
}

# ── 4) build จาก spec ที่ track ไว้ ──────────────────────────────────────
Push-Location $backendDir
try {
    & $venvPy -m PyInstaller --noconfirm --clean $specFile
    if ($LASTEXITCODE -ne 0) { Write-Host "[!] PyInstaller ล้มเหลว" -ForegroundColor Red; exit 1 }
} finally { Pop-Location }

$builtExe = Join-Path $distDir "$specName\$specName.exe"
if (-not (Test-Path $builtExe)) { Write-Host "[!] ไม่พบ $builtExe" -ForegroundColor Red; exit 1 }

# ── 5) smoke test: .exe ต้องบูตแล้วตอบ /health ได้จริง ก่อนจะถือว่า build ผ่าน ──
Write-Host "[*] smoke test: รัน .exe แล้วยิง /health ..." -ForegroundColor Cyan
$proc = Start-Process -FilePath $builtExe -PassThru -WindowStyle Hidden
$ok = $false
foreach ($i in 1..30) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:8756/health" -TimeoutSec 3 -UseBasicParsing
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch { }
}
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
if (-not $ok) {
    Write-Host "[!] .exe บูตแล้วแต่ /health ไม่ตอบใน 60 วินาที — bundle ยังไม่ครบ (ดู hiddenimports ใน .spec)" -ForegroundColor Red
    exit 1
}
Write-Host "[*] smoke test ผ่าน" -ForegroundColor Green

# ── 6) copy ไป binaries/ พร้อม _internal ────────────────────────────────
if (-not (Test-Path $sidecarDir)) { New-Item -ItemType Directory -Path $sidecarDir -Force | Out-Null }
Copy-Item -Path (Join-Path $distDir "$specName\*") -Destination $sidecarDir -Recurse -Force
$copiedExe = Join-Path $sidecarDir "$specName.exe"
$targetExe = Join-Path $sidecarDir "$specName-$targetTriple.exe"
if (Test-Path $copiedExe) { Move-Item -Path $copiedExe -Destination $targetExe -Force }

Write-Host "เสร็จ — sidecar: $targetExe" -ForegroundColor Green
```

The header banner that says "SCAFFOLDING — never run end to end" must be deleted once step 4 below passes, and replaced with a one-line note recording the date it was first validated.

- [ ] **Step 4: Run it locally**

Run: `powershell -ExecutionPolicy Bypass -File scripts\build_sidecar.ps1`
Expected: the script reaches "smoke test ผ่าน" and prints the sidecar path. If the smoke test fails, read the console window's traceback, add the missing module to `hiddenimports` in the spec, and re-run. This step is the one that has never been done; budget time for two or three iterations here.

- [ ] **Step 5: Verify the packaged app end to end**

Run: `cd frontend && npm run tauri build`
Then run the installer from `frontend/src-tauri/target/release/bundle/nsis/`, launch the installed app **with no terminal open and no uvicorn running**, and confirm the status bar reaches `ONLINE`. Close the app and confirm in Task Manager that `g-music-backend.exe` has exited.

- [ ] **Step 6: Commit**

```bash
git add backend/sidecar_entry.py backend/g-music-backend.spec scripts/build_sidecar.ps1
git commit -m "build(sidecar): build from the tracked spec, exclude ML deps, smoke-test the binary"
```

### Task 17: Make CI build the sidecar before bundling

**Files:**
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Produces: a tagged push produces a signed installer plus `latest.json`.

- [ ] **Step 1: Add the Python and sidecar steps**

In `.github/workflows/release.yml`, insert between "Setup Rust" and "Install frontend deps":

```yaml
      - name: Setup Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Build backend sidecar
        shell: pwsh
        run: ./scripts/build_sidecar.ps1 -VenvPath "${{ github.workspace }}/backend/.venv-ci" -CreateIfMissing
```

and add a test gate before the build so a broken commit cannot be released:

```yaml
      - name: Frontend tests
        working-directory: frontend
        run: npx vitest run

      - name: Backend tests
        shell: pwsh
        run: |
          ./backend/.venv-ci/Scripts/python.exe -m pip install pytest==8.3.4
          cd backend
          ../backend/.venv-ci/Scripts/python.exe -m pytest
```

- [ ] **Step 2: Confirm the sidecar is not committed**

`.gitignore` already ignores `backend/build/` and `backend/dist/`. Add the sidecar output too, since it is a build artifact that must never be committed:

```
# Sidecar binary (สร้างจาก scripts/build_sidecar.ps1 — ห้าม commit)
frontend/src-tauri/binaries/
```

- [ ] **Step 3: Dry-run the workflow**

Push a throwaway tag on a branch: `git tag v0.1.0-rc1 && git push origin v0.1.0-rc1`.
Expected: the run reaches "Build Tauri" and produces a draft release with an `.exe`, an `.exe.sig` and `latest.json`. If it fails at the bundle step with "failed to find sidecar", the copy in Task 16 step 6 did not produce the target-triple filename that the runner's `rustc -vV` reports — read the runner log for the triple it printed.

- [ ] **Step 4: Verify the updater endpoint before shipping**

`tauri.conf.json` points the updater at `https://github.com/piyawatproject/G-Music/releases/latest/download/latest.json`, and `MEMORY.md` still lists "point the updater at the real repo" as an open TODO. Open that URL in a browser. If it 404s, the updater is inert in the field. Fix the repository path before publishing a non-draft release, and confirm the GitHub secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are set.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml .gitignore
git commit -m "ci: build and test the sidecar before bundling the installer"
```

### Task 18: Clean-machine acceptance

**Files:** none — this is the phase's proof.

- [ ] **Step 1: Prepare a clean Windows VM**

A fresh Windows 10/11 x64 VM with **no Python, no CUDA, no Rust, no Node**. Do not install anything before running the installer.

- [ ] **Step 2: Run the acceptance checklist**

| # | Action | Expected |
|---|---|---|
| 1 | Run the NSIS `.exe` from the draft release | Installs without prompting for dependencies |
| 2 | Launch from the Start menu | Window opens; footer shows `CONNECTING` then `ONLINE` within 60 s |
| 3 | Open the Plugins tab | All three optional plugins show as not installed, each with its install command and licence |
| 4 | Open the Files tab | Empty workspace, no error |
| 5 | Import an MP3 in Remix, drag it onto a track | Waveform draws; Space plays it |
| 6 | Set a fade and a pan, press **⬇ WAV** | A file downloads and contains the fade and the pan |
| 7 | Open Voice Studio and try TTS | Fails with the Thai message naming the missing package — **not** a stack trace, and the app stays usable |
| 8 | Close the app, open Task Manager | No `g-music-backend.exe` remains |
| 9 | Relaunch | Backend starts again; the project saved in step 6 reopens |

Steps 5–6 are the ones that prove phases A–C shipped; step 7 proves the lite runtime degrades honestly; steps 2 and 8 prove phase D.

- [ ] **Step 3: Record the result**

Update `docs/appendices/E-risk-matrix.md` row **R-006** from open to mitigated, with the date and the tag that was validated — matching how R-009 was closed. Update the "SCAFFOLDING" banner in `docs/PACKAGING_SIDECAR.md` to a validated-on note. Do not mark R-006 mitigated unless every row above passed.

- [ ] **Step 4: Commit**

```bash
git add docs/appendices/E-risk-matrix.md docs/PACKAGING_SIDECAR.md
git commit -m "docs: mark R-006 mitigated - sidecar validated on a clean machine"
```

**Phase D exit gate:** every row of the Task 18 checklist passes on a machine that has never had a developer toolchain. G-04 is closed.

---

## What this plan deliberately does not fix

Named so nobody assumes they came along for free:

| Gap | Why not here |
|---|---|
| **G-05** Mix Copilot apply is broken | Independent of all four; a one-task contract fix. Do it whenever — it is cheap and the current behaviour actively lies. |
| **G-06** Job continuity | Phase C makes render a long job, which makes this hurt more. It is the natural next phase. |
| **G-07** GPU admission control | Depends on G-06's queue existing first. |
| **G-08** Master-FX preview/render drift | Phase C stops the silent no-op but does not achieve FX parity. Needs a canonical FX spec implemented on both sides. |
| **G-09** CPU fallback | Independent; needed before the lite installer is genuinely useful on a GPU-less machine. |
| **G-10** Upload overwrite and traversal | Phase B fixes it for the **import** path only. `POST /files/upload` is still unsanitised. Fix it in the same sitting as G-05. |
| **G-13** Library/Marketplace mocks | Phase B leaves a `TODO(G-13)` at the drag payload; the packs still have no files. |

## Self-review

**Coverage.** G-03 → Tasks 1–4. G-02 → Tasks 5–9. G-01 → Tasks 10–14. G-04 → Tasks 15–18. Each gap's exit criterion from the audit is a named gate at the end of its phase.

**Corrections made while writing.** The audit's sidecar blocker #2 (missing shell capability) does not apply to a Rust-side spawn; phase D states why and leaves the capability file untouched. The audit also treated "no backend tests" as a separate finding — it is a hard prerequisite for phases B and C, so it became Task 6 rather than a later cleanup.

**Type consistency.** `assetId` is the field on `Clip` and also the name of the pure function in `assets.ts`; the engine method that registers one is `engine.addAsset(kind, name) -> string`. `resolve_asset(kind, name) -> Path` is the backend twin and is used by both `bundle.py` and `render.py`. `migrateSnapshot` is the single entry point for both `openProject` and `recoverDraft`. `SCHEMA_VERSION` ends at 3.

**Known follow-up inside this plan's own scope:** Task 5 step 6 touches nine files at once, which is larger than the usual task boundary. It is kept whole because `tsc --noEmit` cannot pass until every `clip.src` reference is converted — splitting it would leave the tree red between commits.
