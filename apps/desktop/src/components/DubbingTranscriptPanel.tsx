import { files, type Job } from "../api";
import { JobProgress } from "./JobProgress";

export interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  sourceAudio: string;
  detectedLanguage: string | null;
  segmentCount: number;
  durationSec: number;
  segments: TranscriptSegment[];
  subtitleSrt: string | null;
  subtitleVtt: string | null;
}

interface DubbingTranscriptPanelProps {
  source: string | null;
  uploading: boolean;
  analyzing: boolean;
  job: Job | null;
  transcript: TranscriptResult | null;
  onAnalyze: () => void;
  active?: boolean;
}

export function DubbingTranscriptPanel({
  source,
  uploading,
  analyzing,
  job,
  transcript,
  onAnalyze,
  active = true,
}: DubbingTranscriptPanelProps) {
  const stale = !!transcript && transcript.sourceAudio !== source;

  return (
    <section
      id="dubbing-panel-transcript"
      className="dubbing-transcript"
      role="tabpanel"
      aria-labelledby="dubbing-tab-transcript"
      hidden={!active}
    >
      <div className="dubbing-transcript__heading">
        <div>
          <h3>Transcript</h3>
          <p className="hint">
            ถอดเสียงและดูเวลาแต่ละช่วงก่อนเริ่มพากย์ โดยไม่เรียก TTS หรือแปลข้อความ
          </p>
        </div>
        <button
          className="primary"
          onClick={onAnalyze}
          disabled={!source || uploading || analyzing}
        >
          {analyzing ? "กำลังวิเคราะห์…" : transcript && !stale ? "วิเคราะห์ใหม่" : "วิเคราะห์ Transcript"}
        </button>
      </div>

      {source ? (
        <p className="dubbing-transcript__source">ไฟล์ปัจจุบัน: <strong>{source}</strong></p>
      ) : (
        <p className="dubbing-transcript__source">ยังไม่ได้เลือกไฟล์ต้นฉบับ</p>
      )}

      <JobProgress job={job} />

      {stale && transcript && (
        <p className="dubbing-transcript__notice dubbing-transcript__notice--stale" role="status">
          ผลด้านล่างเป็นของไฟล์ “{transcript.sourceAudio}”
          {source ? ` ไม่ตรงกับไฟล์ปัจจุบัน “${source}”` : " ยังไม่มีไฟล์ปัจจุบันที่เลือกไว้"}
          กรุณาวิเคราะห์ไฟล์ปัจจุบันก่อนนำผลไปใช้ต่อ
        </p>
      )}

      {transcript ? (
        <>
          {!stale && (
            <p className="dubbing-transcript__notice" role="status">
              Transcript นี้มาจากไฟล์ “{transcript.sourceAudio}”
            </p>
          )}
          <div className="dubbing-transcript__summary" aria-label="สรุป transcript">
            <div><span>ภาษาที่ตรวจพบ</span><strong>{transcript.detectedLanguage ?? "ไม่ระบุ"}</strong></div>
            <div><span>จำนวนช่วง</span><strong>{transcript.segmentCount}</strong></div>
            <div><span>ความยาว</span><strong>{formatTimestamp(transcript.durationSec)}</strong></div>
          </div>

          {transcript.segments.length > 0 ? (
            <div className="dubbing-transcript__list" role="list" aria-label="ช่วงข้อความถอดเสียง">
              {transcript.segments.map((segment) => (
                <div className="dubbing-transcript__row" role="listitem" key={segment.id}>
                  <span className="dubbing-transcript__time">
                    {formatTimestamp(segment.start)} – {formatTimestamp(segment.end)}
                  </span>
                  <p>{segment.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="dubbing-transcript__empty">ไม่พบช่วงเสียงพูดในไฟล์นี้</p>
          )}

          <div className="dubbing-transcript__downloads">
            {!stale && transcript.subtitleSrt && (
              <a className="dl" href={files.downloadUrl(transcript.subtitleSrt)} download>
                ⬇ SRT
              </a>
            )}
            {!stale && transcript.subtitleVtt && (
              <a className="dl" href={files.downloadUrl(transcript.subtitleVtt)} download>
                ⬇ VTT
              </a>
            )}
          </div>
        </>
      ) : source ? (
        job?.status === "error" ? (
          <p className="dubbing-transcript__empty">วิเคราะห์ไม่สำเร็จ แก้ปัญหาแล้วกดวิเคราะห์ซ้ำได้</p>
        ) : (
          <p className="dubbing-transcript__empty">กด “วิเคราะห์ Transcript” เพื่อถอดเสียงและดู timestamp ของแต่ละช่วง</p>
        )
      ) : (
        <p className="dubbing-transcript__empty">เลือกไฟล์ต้นฉบับที่แท็บ Dub ก่อนเริ่มวิเคราะห์</p>
      )}
    </section>
  );
}

function formatTimestamp(seconds: number): string {
  const centiseconds = Math.round(Math.max(0, seconds) * 100);
  const hours = Math.floor(centiseconds / 360_000);
  const minutes = Math.floor((centiseconds % 360_000) / 6_000);
  const remaining = centiseconds % 6_000;
  const wholeSeconds = Math.floor(remaining / 100);
  const fraction = remaining % 100;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(fraction).padStart(2, "0")}`;
}
