// @req FR-06 — hook: spawn job แล้วติดตาม progress ผ่าน WebSocket
import { useCallback, useRef, useState } from "react";
import { jobs, type Job } from "./api";

// hook: เริ่มงาน (spawn คืน job_id) แล้วติดตามความคืบหน้าผ่าน WebSocket
export function useJob() {
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<(() => void) | null>(null);

  const start = useCallback(async (spawn: () => Promise<{ job_id: string }>) => {
    setBusy(true);
    setJob(null);
    closeRef.current?.();
    try {
      const { job_id } = await spawn();
      closeRef.current = jobs.watch(job_id, (j) => {
        setJob(j);
        if (j.status === "done" || j.status === "error") setBusy(false);
      });
    } catch (e: any) {
      setJob({
        id: "-", kind: "-", status: "error", progress: 0,
        message: "", error: String(e?.message ?? e),
      });
      setBusy(false);
    }
  }, []);

  return { job, busy, start };
}
