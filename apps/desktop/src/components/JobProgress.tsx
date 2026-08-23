// @req FR-06 — UI progress ของ job (รองรับ FR-02.7/03.8/04b.8)
import { API_BASE, type Job } from "../api";

export function JobProgress({ job }: { job: Job | null }) {
  if (!job) return null;
  const pct = Math.round(job.progress * 100);
  const output =
    job.status === "done" && job.result?.output
      ? String(job.result.output).split(/[\\/]/).pop()
      : null;

  return (
    <div className={`job job-${job.status}`}>
      <div className="job-head">
        <span className="job-status">{statusLabel(job.status)}</span>
        <span className="job-msg">{job.message || job.error}</span>
      </div>
      {(job.status === "running" || job.status === "queued") && (
        <div className="bar">
          <div className="bar-fill" style={{ width: `${pct}%` }} />
          <span className="bar-pct">{pct}%</span>
        </div>
      )}
      {output && (
        <audio
          controls
          src={`${API_BASE}/files/download/${output}`}
          className="player"
        />
      )}
      {job.status === "done" && output && (
        <a className="dl" href={`${API_BASE}/files/download/${output}`} download>
          ⬇ ดาวน์โหลด {output}
        </a>
      )}
    </div>
  );
}

function statusLabel(s: string) {
  return { queued: "⏳ รอคิว", running: "⚙️ กำลังทำงาน", done: "✅ เสร็จ", error: "❌ ผิดพลาด", interrupted: "⚠️ งานถูกขัดจังหวะ" }[s] ?? s;
}
