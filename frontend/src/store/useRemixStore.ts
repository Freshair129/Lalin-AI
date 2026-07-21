import { create } from "zustand";

// ── RemixPanel state store ──────────────────────────────────
// รวม state ที่เคย prop-drill ผ่าน useState หลายตัวใน RemixPanel.tsx
// เข้า store เดียว: recipe (source/beat/fx params), master-fx (preview chain),
// panel-size (ลากปรับได้), และ UI-layout (layout/leftTab/showDesigner)
// หมายเหตุ: ไม่รวม clip-engine (project/undo/selection) — อันนั้นอยู่ใน useClipEngine.ts ตามเดิม

export type RemixLayout = "standard" | "node";
export type RemixLeftTab = "library" | "track";

export interface RemixRecipeState {
  source: string | null;
  beat: string | null;
  autotune: boolean;
  autotuneStrength: number;
  keyOverride: string;
  fx: boolean;
  reverb: number;
  delay: number;
  phraseBars: number;
  offsetAuto: boolean;
  offsetMs: number;
  lufs: number;
}

export interface RemixMasterFxState {
  mReverb: number;
  mEcho: number;
  mComp: boolean;
}

export interface RemixPanelSizeState {
  leftW: number;
  tlH: number;
  rackH: number;
}

export interface RemixUiLayoutState {
  layout: RemixLayout;
  leftTab: RemixLeftTab;
  showDesigner: boolean;
}

export interface RemixStoreState
  extends RemixRecipeState,
    RemixMasterFxState,
    RemixPanelSizeState,
    RemixUiLayoutState {
  setSource: (v: string | null) => void;
  setBeat: (v: string | null) => void;
  setAutotune: (v: boolean) => void;
  setAutotuneStrength: (v: number) => void;
  setKeyOverride: (v: string) => void;
  setFx: (v: boolean) => void;
  setReverb: (v: number) => void;
  setDelay: (v: number) => void;
  setPhraseBars: (v: number) => void;
  setOffsetAuto: (v: boolean) => void;
  setOffsetMs: (v: number) => void;
  setLufs: (v: number) => void;

  setMReverb: (v: number) => void;
  setMEcho: (v: number) => void;
  setMComp: (v: boolean) => void;

  setLeftW: (v: number | ((prev: number) => number)) => void;
  setTlH: (v: number | ((prev: number) => number)) => void;
  setRackH: (v: number | ((prev: number) => number)) => void;

  setLayout: (v: RemixLayout) => void;
  setLeftTab: (v: RemixLeftTab) => void;
  setShowDesigner: (v: boolean) => void;

  // โหลด/รีเซ็ตค่า recipe+master-fx+panel-size ทีเดียว (ใช้ตอน applySnapshot)
  loadRecipe: (v: RemixRecipeState & RemixMasterFxState & RemixPanelSizeState) => void;
}

const DEFAULTS: RemixRecipeState & RemixMasterFxState & RemixPanelSizeState & RemixUiLayoutState = {
  source: null,
  beat: null,
  autotune: true,
  autotuneStrength: 1,
  keyOverride: "auto",
  fx: true,
  reverb: 0.16,
  delay: 0.12,
  phraseBars: 0,
  offsetAuto: true,
  offsetMs: 0,
  lufs: -14,
  mReverb: 0,
  mEcho: 0,
  mComp: false,
  leftW: 230,
  tlH: 230,
  rackH: 190,
  layout: "standard",
  leftTab: "library",
  showDesigner: false,
};

export const useRemixStore = create<RemixStoreState>((set) => ({
  ...DEFAULTS,

  setSource: (v) => set({ source: v }),
  setBeat: (v) => set({ beat: v }),
  setAutotune: (v) => set({ autotune: v }),
  setAutotuneStrength: (v) => set({ autotuneStrength: v }),
  setKeyOverride: (v) => set({ keyOverride: v }),
  setFx: (v) => set({ fx: v }),
  setReverb: (v) => set({ reverb: v }),
  setDelay: (v) => set({ delay: v }),
  setPhraseBars: (v) => set({ phraseBars: v }),
  setOffsetAuto: (v) => set({ offsetAuto: v }),
  setOffsetMs: (v) => set({ offsetMs: v }),
  setLufs: (v) => set({ lufs: v }),

  setMReverb: (v) => set({ mReverb: v }),
  setMEcho: (v) => set({ mEcho: v }),
  setMComp: (v) => set({ mComp: v }),

  setLeftW: (v) => set((s) => ({ leftW: typeof v === "function" ? v(s.leftW) : v })),
  setTlH: (v) => set((s) => ({ tlH: typeof v === "function" ? v(s.tlH) : v })),
  setRackH: (v) => set((s) => ({ rackH: typeof v === "function" ? v(s.rackH) : v })),

  setLayout: (v) => set({ layout: v }),
  setLeftTab: (v) => set({ leftTab: v }),
  setShowDesigner: (v) => set({ showDesigner: v }),

  loadRecipe: (v) => set({ ...v }),
}));
