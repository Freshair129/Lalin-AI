// @req NFR-02 — poll /runtime/status ให้ status bar (telemetry + งานที่ค้าง)
import { useEffect, useState } from "react";
import { runtime, type RuntimeActivityStatus } from "../api";

const POLL_MS = 5000;

export function useRuntimeActivity(enabled: boolean): RuntimeActivityStatus | null {
  const [status, setStatus] = useState<RuntimeActivityStatus | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      try {
        const next = await runtime.status();
        if (!cancelled) setStatus(next);
      } catch {
        if (!cancelled) setStatus(null);
      } finally {
        if (!cancelled) timer = setTimeout(refresh, POLL_MS);
      }
    };

    refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  return status;
}
