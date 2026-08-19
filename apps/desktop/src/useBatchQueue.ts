// @req FR-13 — engine คิวประมวลผลชุด (tts/dubbing/mastering ทีละงาน)
import { useCallback, useRef, useState } from "react";
import { tts, dubbing, mastering, jobs, type Job } from "./api";

// ประเภทงานที่คิวรองรับ — ต้องตรงกับ endpoint ที่มีอยู่ใน api.ts
export type BatchKind = "tts" | "dubbing" | "mastering";

export type BatchStatus = "pending" | "running" | "done" | "error";

export interface BatchItem {
  id: string;
  kind: BatchKind;
  label: string;
  params: Record<string, unknown>;
  status: BatchStatus;
  jobId?: string;
  progress?: number;
  message?: string;
  error?: string;
}

let seq = 0;
function nextId() {
  seq += 1;
  return `batch-${Date.now()}-${seq}`;
}

// เรียก endpoint ที่ตรงกับชนิดงาน — คืน job_id เพื่อไป watch ต่อ
function spawnByKind(kind: BatchKind, params: Record<string, unknown>) {
  if (kind === "tts") return tts.synth(params);
  if (kind === "dubbing") return dubbing.run(params);
  return mastering.run(params);
}

// hook: คิวประมวลผลงานแบบเรียงลำดับ (ทีละงาน) ฝั่ง frontend
// backend รันงานเบื้องหลังอยู่แล้ว แต่คิวนี้ควบคุมว่า "ส่งงานถัดไปเมื่อไหร่"
export function useBatchQueue() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  // pauseRequested: true = ให้หยุดหลังงานปัจจุบันเสร็จ (ไม่ยกเลิกงานที่กำลังรัน)
  const pauseRequested = useRef(false);
  // กันไม่ให้ runner ทำงานซ้อนกันหลาย instance
  const runningRef = useRef(false);
  const closeWatchRef = useRef<(() => void) | null>(null);

  const patchItem = useCallback((id: string, patch: Partial<BatchItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const enqueue = useCallback((item: Omit<BatchItem, "id" | "status">) => {
    setItems((prev) => [...prev, { ...item, id: nextId(), status: "pending" }]);
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const moveUp = useCallback((id: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id);
      if (idx <= 0) return prev;
      const next = prev.slice();
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((id: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id);
      if (idx === -1 || idx >= prev.length - 1) return prev;
      const next = prev.slice();
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  // watch งานหนึ่งจนจบ (done/error) แล้ว resolve — ไม่ throw เพื่อให้ runner ไปงานถัดไปได้เสมอ
  const watchToCompletion = useCallback(
    (id: string, jobId: string) =>
      new Promise<void>((resolve) => {
        closeWatchRef.current?.();
        closeWatchRef.current = jobs.watch(jobId, (j: Job) => {
          patchItem(id, {
            progress: j.progress,
            message: j.message,
            status: j.status === "done" ? "done" : j.status === "error" ? "error" : "running",
            error: j.error,
          });
          if (j.status === "done" || j.status === "error") {
            closeWatchRef.current?.();
            closeWatchRef.current = null;
            resolve();
          }
        });
      }),
    [patchItem]
  );

  // runner หลัก: ประมวลผลงานที่ status = pending ทีละอันตามลำดับในลิสต์
  const run = useCallback(async () => {
    if (runningRef.current) return; // กันรันซ้อน
    runningRef.current = true;
    pauseRequested.current = false;
    setRunning(true);

    try {
      // อ่านลิสต์สดจาก state ทุกรอบ (ผ่าน setItems callback) เพื่อลำดับที่ถูกต้อง
      while (true) {
        if (pauseRequested.current) break;

        let current: BatchItem | undefined;
        setItems((prev) => {
          current = prev.find((it) => it.status === "pending");
          return prev;
        });
        // รอ microtask ให้ setItems (อ่านอย่างเดียว) สะท้อนค่า current แล้ว
        await Promise.resolve();
        if (!current) break;

        const item = current;
        patchItem(item.id, { status: "running", progress: 0, error: undefined });

        try {
          const { job_id } = await spawnByKind(item.kind, item.params);
          patchItem(item.id, { jobId: job_id });
          await watchToCompletion(item.id, job_id);
        } catch (e: any) {
          patchItem(item.id, { status: "error", error: String(e?.message ?? e) });
        }

        if (pauseRequested.current) break;
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, [patchItem, watchToCompletion]);

  // pause: หยุดหลังงานปัจจุบัน (ที่กำลัง watch อยู่) เสร็จ — ไม่ตัดการเชื่อมต่อ WS กลางคัน
  const pause = useCallback(() => {
    pauseRequested.current = true;
  }, []);

  return {
    items,
    running,
    enqueue,
    remove,
    clear,
    moveUp,
    moveDown,
    run,
    pause,
  };
}

export type UseBatchQueue = ReturnType<typeof useBatchQueue>;
