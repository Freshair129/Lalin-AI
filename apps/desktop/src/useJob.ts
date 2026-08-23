// @req FR-06 — hook: spawn job แล้วติดตาม progress ผ่าน WebSocket
import { useCallback, useEffect, useRef, useState } from "react";
import { jobs, type Job } from "./api";

const isTerminal = (status: Job["status"]) =>
  status === "done" || status === "error" || status === "interrupted";

// hook: เริ่มงาน (spawn คืน job_id), persist id แล้ว re-attach หลัง reload
export function useJob(storageName?: string) {
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<(() => void) | null>(null);
  const storageKey = storageName ? `lalin:job:${storageName}` : null;

  const clearStored = useCallback(() => {
    if (storageKey) window.localStorage.removeItem(storageKey);
  }, [storageKey]);

  const watch = useCallback((jobId: string) => {
    closeRef.current?.();
    closeRef.current = jobs.watch(jobId, (update) => {
      setJob(update);
      if (isTerminal(update.status)) {
        setBusy(false);
        clearStored();
        closeRef.current?.();
        closeRef.current = null;
      }
    });
  }, [clearStored]);

  useEffect(() => {
    if (!storageKey) return;
    const jobId = window.localStorage.getItem(storageKey);
    if (!jobId) return;
    let cancelled = false;
    jobs.get(jobId).then((restored) => {
      if (cancelled) return;
      setJob(restored);
      if (isTerminal(restored.status)) {
        setBusy(false);
        clearStored();
        return;
      }
      setBusy(true);
      watch(jobId);
    }).catch(() => {
      if (!cancelled) clearStored();
    });
    return () => {
      cancelled = true;
      closeRef.current?.();
      closeRef.current = null;
    };
  }, [clearStored, storageKey, watch]);

  const start = useCallback(async (spawn: () => Promise<{ job_id: string }>) => {
    setBusy(true);
    setJob(null);
    closeRef.current?.();
    try {
      const { job_id } = await spawn();
      if (storageKey) window.localStorage.setItem(storageKey, job_id);
      watch(job_id);
    } catch (e: any) {
      setJob({
        id: "-", kind: "-", status: "error", progress: 0,
        message: "", error: String(e?.message ?? e), resource: "cpu",
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      clearStored();
      setBusy(false);
    }
  }, [clearStored, storageKey, watch]);

  return { job, busy, start };
}
