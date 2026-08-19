// @req FR-09 — ยก clip engine ขึ้นระดับ App ให้ทุกแท็บใช้ตัวเดียวกัน (FR-09.1)
import { createContext, useContext, type ReactNode } from "react";
import { useClipEngine, type ClipEngine } from "../timeline/useClipEngine";

/**
 * EngineProvider — ยก clip engine ขึ้นระดับ App เพื่อ share ทั้ง workspace
 *  - timeline dock ล่าง (StudioDock) + RemixPanel + panel อื่น ๆ ใช้ engine ตัวเดียวกัน
 *  - ทำให้ผลงานจากทุกเครื่องมือ (TTS/dub/master) drop เป็น clip ลง timeline เดียวได้ (Wave 2.2)
 */
const EngineContext = createContext<ClipEngine | null>(null);

export function EngineProvider({ children }: { children: ReactNode }) {
  const engine = useClipEngine();
  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}

export function useEngine(): ClipEngine {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error("useEngine ต้องอยู่ภายใน <EngineProvider>");
  return ctx;
}
