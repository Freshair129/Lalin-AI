import { useCallback, useEffect, useRef, useState } from "react";

type UnavailableReason = "expired" | "unavailable";
type PreviewLifetime = { key: string; deadline: number; reason: UnavailableReason | null };

export const PREVIEW_EXPIRED_MESSAGE = "Preview หมดอายุแล้ว กด ‘สร้าง preview ใหม่’ หรือ ‘Drift preview’ เพื่อวิเคราะห์จาก Source และ Beat ปัจจุบัน";

/** รับทั้ง HTTP error จาก API client และ error ของงานเบื้องหลัง */
export function isPreviewExpiredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : error;
  if (message === "preview_expired") return true;
  if (typeof message !== "string" || !message.startsWith("410: ")) return false;
  try { return JSON.parse(message.slice(5)).detail === "preview_expired"; }
  catch { return false; }
}

export function useWarpPreviewLifetime() {
  const active = useRef<PreviewLifetime | null>(null);
  const [current, setCurrent] = useState<PreviewLifetime | null>(null);
  const register = useCallback((key: string, expiresAt: string) => {
    // การ render ซ้ำหรือปรับนาฬิกาย้อนหลังต้องไม่คืนชีพ preview เดิม
    if (active.current?.key === key) return;
    const deadline = Date.parse(expiresAt);
    active.current = { key, deadline, reason: !Number.isFinite(deadline) || deadline <= Date.now() ? "expired" : null };
    setCurrent(active.current);
  }, []);
  const clear = useCallback(() => { active.current = null; setCurrent(null); }, []);
  const invalidate = useCallback((key: string, reason: UnavailableReason) => {
    if (active.current?.key !== key || active.current.reason) return;
    active.current = { ...active.current, reason };
    setCurrent(active.current);
  }, []);
  const isFresh = useCallback((key: string) => {
    const preview = active.current;
    if (!preview || preview.key !== key || preview.reason) return false;
    if (preview.deadline <= Date.now()) {
      invalidate(key, "expired");
      return false;
    }
    return true;
  }, [invalidate]);

  const key = current?.key;
  const deadline = current?.deadline;
  const reason = current?.reason ?? null;
  useEffect(() => {
    if (!key || deadline == null || reason) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(timer);
      if (isFresh(key)) timer = setTimeout(check, Math.min(Math.max(1, deadline - Date.now()), 2_147_483_647));
    };
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [key, deadline, reason, isFresh]);

  return { reason, register, clear, invalidate, isFresh };
}
