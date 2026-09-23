// การ์ดสถานะ voice worker สำหรับ GoVibe Mission Control
//
// ตั้งใจให้เป็นชิ้นเดียวจบ: ไม่ import อะไรจากภายในของ GoVibe เลย (ไม่แตะ missionGateway)
// จึงย้ายไปวางใน dashboard ตัวอื่นได้ และไม่พังเมื่อ GoVibe รีแฟกเตอร์ภายใน
// สไตล์ใช้ Tailwind class ชุดเดียวกับที่ GoVibe ใช้อยู่ — ถ้าโปรเจกต์ปลายทางไม่ใช้ Tailwind
// ให้เปลี่ยนเฉพาะ className ตรรกะข้างในไม่ต้องแตะ

import { useEffect, useState } from "react";
import { probeVoiceWorker, summarize, type VoiceWorkerProbe, type VoiceWorkerStatus } from "./voiceWorkerStatus";

const TONE_CLASS = {
  ok: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  warn: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  down: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
} as const;

export type VoiceWorkerPanelProps = {
  /** path ที่ proxy ของ dev server หรือ backend เปิดไว้ */
  url?: string;
  /** ถี่แค่ไหน — 10 วินาทีพอสำหรับสถานะ ไม่ใช่ข้อมูลที่เปลี่ยนทุกวินาที */
  intervalMs?: number;
  title?: string;
};

export function VoiceWorkerPanel({
  url = "/api/voice-worker/status",
  intervalMs = 10_000,
  title = "Lalin voice worker",
}: VoiceWorkerPanelProps) {
  const [probe, setProbe] = useState<VoiceWorkerProbe | null>(null);

  useEffect(() => {
    // cancelled กัน setState หลัง unmount และกันผลของรอบเก่ามาทับรอบใหม่เวลา url เปลี่ยน
    let cancelled = false;
    const tick = async () => {
      const next = await probeVoiceWorker(url);
      if (!cancelled) setProbe(next);
    };
    void tick();
    const timer = setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [url, intervalMs]);

  if (!probe) {
    return (
      <section className="rounded-xl bg-slate-900/60 p-4 ring-1 ring-slate-700/50">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <p className="mt-2 text-xs text-slate-400">กำลังอ่านสถานะ…</p>
      </section>
    );
  }

  const badge = summarize(probe);

  return (
    <section className="rounded-xl bg-slate-900/60 p-4 ring-1 ring-slate-700/50">
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${TONE_CLASS[badge.tone]}`}>
          {badge.label}
        </span>
      </header>

      {probe.state === "ok" ? (
        <StatusBody status={probe.status} fetchedAt={probe.fetchedAt} />
      ) : (
        <p className="mt-3 text-xs text-slate-400">{probe.detail}</p>
      )}
    </section>
  );
}

/** แยกออกมาเป็นคอมโพเนนต์ของตัวเองเพื่อให้ TypeScript แคบชนิดของ probe ได้ตรงจุดเดียว */
function StatusBody({ status, fetchedAt }: { status: VoiceWorkerStatus; fetchedAt: string }) {
  return (
    <>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Row label="profile" value={status.profile_id} />
        <Row label="revision" value={status.profile_revision} />
        <Row label="engine" value={[status.engine, status.engine_version].filter(Boolean).join(" ")} />
        <Row label="device" value={status.device?.effective} />
        <Row label="งานที่ทำอยู่" value={formatCapacity(status)} />
        <Row label="heartbeat" value={formatSeconds(status.heartbeat_age_seconds)} />
      </dl>
      {status.labeled_stub ? (
        <p className="mt-3 text-xs text-amber-300">
          worker นี้เป็น stub ที่ติดป้ายไว้ — ผลที่ได้ไม่ใช่ของจริง
        </p>
      ) : null}
      {status.oom_lockout ? (
        <p className="mt-3 text-xs text-rose-300">
          ถูกล็อกหลังโดน OOM kill ซ้ำ (D18) — จะไม่กลับมาเอง ต้องเพิ่มเพดาน memory แล้ว restart
        </p>
      ) : null}
      <p className="mt-3 text-[11px] text-slate-500">
        อ่านเมื่อ {new Date(fetchedAt).toLocaleTimeString()} · epoch {status.runtime_epoch ?? "?"}
      </p>
    </>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate font-mono text-slate-300">{value || "—"}</dd>
    </div>
  );
}

function formatCapacity(status: { capacity: { in_use?: number; max_concurrency?: number } | null }): string {
  const capacity = status.capacity;
  if (!capacity) return "—";
  return `${capacity.in_use ?? 0} / ${capacity.max_concurrency ?? "?"}`;
}

function formatSeconds(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)} วิ`;
}

export default VoiceWorkerPanel;
