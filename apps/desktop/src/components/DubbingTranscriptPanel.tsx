import { useState } from "react";
import { files, type Job, type Voice } from "../api";
import { JobProgress } from "./JobProgress";

export interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  jobId?: string;
  sourceAudio: string;
  detectedLanguage: string | null;
  segmentCount: number;
  durationSec: number;
  segments: TranscriptSegment[];
  subtitleSrt: string | null;
  subtitleVtt: string | null;
}

export interface SpeakerSlot {
  id: string;
  label: string;
  voiceId: string;
}

interface DubbingTranscriptPanelProps {
  source: string | null;
  uploading: boolean;
  analyzing: boolean;
  job: Job | null;
  transcript: TranscriptResult | null;
  voices?: Voice[];
  speakerSlots?: SpeakerSlot[];
  segmentSpeakers?: Record<string, string>;
  renderJob?: Job | null;
  rendering?: boolean;
  renderDisabled?: boolean;
  targetLang?: string;
  translate?: boolean;
  onAnalyze: () => void;
  onAddSpeaker?: () => void;
  onUpdateSpeaker?: (speakerId: string, patch: Partial<SpeakerSlot>) => void;
  onRemoveSpeaker?: (speakerId: string) => void;
  onAssignSpeaker?: (segmentId: string, speakerId: string) => void;
  onRender?: () => void;
  selectedSegmentIds?: string[];
  clipsJob?: Job | null;
  exportingClips?: boolean;
  voiceoverJob?: Job | null;
  generatingVoiceover?: boolean;
  onToggleSegment?: (segmentId: string, selected: boolean) => void;
  onSelectAllSegments?: () => void;
  onClearSegmentSelection?: () => void;
  onExportClips?: () => void;
  onVoiceover?: () => void;
  onAddOutputToTimeline?: (output: string) => void;
  active?: boolean;
}

export function DubbingTranscriptPanel({
  source,
  uploading,
  analyzing,
  job,
  transcript,
  voices = [],
  speakerSlots = [],
  segmentSpeakers = {},
  renderJob = null,
  rendering = false,
  renderDisabled = true,
  targetLang = "ไทย",
  translate = true,
  onAnalyze,
  onAddSpeaker = () => {},
  onUpdateSpeaker = () => {},
  onRemoveSpeaker = () => {},
  onAssignSpeaker = () => {},
  onRender = () => {},
  selectedSegmentIds = [],
  clipsJob = null,
  exportingClips = false,
  voiceoverJob = null,
  generatingVoiceover = false,
  onToggleSegment = () => {},
  onSelectAllSegments = () => {},
  onClearSegmentSelection = () => {},
  onExportClips = () => {},
  onVoiceover = () => {},
  onAddOutputToTimeline = () => {},
  active = true,
}: DubbingTranscriptPanelProps) {
  const [addedOutputs, setAddedOutputs] = useState<Record<string, boolean>>({});
  const stale = !!transcript && transcript.sourceAudio !== source;
  const canEditSpeakers = !!transcript && !stale && !analyzing;
  const usedSpeakerIds = new Set(
    transcript?.segments.map((segment) => segmentSpeakers[segment.id]).filter(Boolean) ?? [],
  );
  const hasUnassignedSegment = !!transcript?.segments.some((segment) => (
    !segmentSpeakers[segment.id]
    || !speakerSlots.some((speaker) => speaker.id === segmentSpeakers[segment.id])
  ));
  const hasInvalidTiming = !!transcript?.segments.some((segment) => segment.end <= segment.start);
  const hasMissingVoice = [...usedSpeakerIds].some((speakerId) => {
    const voiceId = speakerSlots.find((speaker) => speaker.id === speakerId)?.voiceId;
    return !voiceId || !voices.some((voice) => voice.id === voiceId);
  });
  const selectedIdSet = new Set(selectedSegmentIds);
  const selectedSegments = transcript?.segments.filter((segment) => selectedIdSet.has(segment.id)) ?? [];
  const selectedDuration = selectedSegments.reduce((sum, segment) => sum + segment.end - segment.start, 0);
  let selectedGroupCount = 0;
  let inSelectedGroup = false;
  for (const segment of transcript?.segments ?? []) {
    if (selectedIdSet.has(segment.id)) {
      if (!inSelectedGroup) selectedGroupCount += 1;
      inSelectedGroup = true;
    } else {
      inSelectedGroup = false;
    }
  }
  const selectedSpeakerIds = new Set(selectedSegments.map((segment) => segmentSpeakers[segment.id]).filter(Boolean));
  const selectedHasMissingVoice = selectedSegments.some((segment) => {
    const speakerId = segmentSpeakers[segment.id];
    const speaker = speakerSlots.find((item) => item.id === speakerId);
    return !speaker || !speaker.voiceId || !voices.some((voice) => voice.id === speaker.voiceId);
  });
  const selectionDisabled = stale || !source || uploading || analyzing || !transcript?.segments.length;
  let clipDisabledReason: string | null = null;
  if (selectionDisabled) clipDisabledReason = "วิเคราะห์ไฟล์ต้นฉบับปัจจุบันก่อนเลือกช่วง";
  else if (selectedSegments.length === 0) clipDisabledReason = "เลือก transcript อย่างน้อยหนึ่งช่วงก่อนส่งออกคลิป";
  else if (selectedGroupCount > 100) clipDisabledReason = "ส่งออกได้ไม่เกิน 100 คลิปต่อ job — เลือกช่วงที่ติดกันเพิ่มขึ้น";
  let voiceoverDisabledReason: string | null = null;
  if (selectionDisabled) voiceoverDisabledReason = "วิเคราะห์ไฟล์ต้นฉบับปัจจุบันก่อนเลือกช่วง";
  else if (selectedSegments.length === 0) voiceoverDisabledReason = "เลือก transcript อย่างน้อยหนึ่งช่วงก่อนสร้าง voice-over";
  else if (selectedDuration > 120) {
    voiceoverDisabledReason = "voice-over เลือกข้อความได้รวมไม่เกิน 120 วินาที";
  } else if (selectedSpeakerIds.size === 0) {
    voiceoverDisabledReason = "เลือกผู้พูดให้ช่วงที่ต้องการก่อนสร้าง voice-over";
  } else if (voices.length === 0 || selectedHasMissingVoice) {
    voiceoverDisabledReason = "เลือก voice profile ให้ผู้พูดของช่วงที่เลือกก่อนสร้าง voice-over";
  }
  let renderDisabledReason: string | null = null;
  if (stale || !source) renderDisabledReason = "วิเคราะห์ไฟล์ต้นฉบับปัจจุบันก่อน render";
  else if (uploading || analyzing) renderDisabledReason = "รอการอัปโหลดหรือวิเคราะห์ให้เสร็จก่อน";
  else if (!transcript?.segments.length) renderDisabledReason = "ต้องมี transcript segments ก่อน render";
  else if (hasInvalidTiming) renderDisabledReason = "มี segment ที่ timestamp ไม่ถูกต้อง กรุณาวิเคราะห์ source ใหม่";
  else if (voices.length === 0) renderDisabledReason = "เพิ่ม voice profile ในคลังเสียงก่อน render";
  else if (hasUnassignedSegment) renderDisabledReason = "กำหนดผู้พูดให้ครบทุก segment ก่อน render";
  else if (hasMissingVoice) renderDisabledReason = "เลือก voice profile ให้ผู้พูดที่ใช้ทุกคนก่อน render";

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
            ตรวจคำถอดเสียง กำหนดผู้พูดและเสียง แล้วสร้างงานพากย์จาก transcript นี้
          </p>
        </div>
        <button
          className="secondary"
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
            <>
              <section className="dubbing-speakers" aria-label="กำหนดผู้พูดและเสียง">
                <div className="dubbing-speakers__heading">
                  <div>
                    <h4>ผู้พูดและเสียง</h4>
                    <p className="hint">ตั้งชื่อผู้พูด เลือก voice profile แล้วกำหนดผู้พูดให้แต่ละช่วงด้านล่าง</p>
                  </div>
                  <button
                    className="secondary"
                    type="button"
                    onClick={onAddSpeaker}
                    disabled={!canEditSpeakers || speakerSlots.length >= 32}
                  >
                    ＋ เพิ่มผู้พูด
                  </button>
                </div>
                {speakerSlots.map((speaker) => (
                  <div className="dubbing-speakers__row" key={speaker.id}>
                    <label className="field">
                      <span>ชื่อผู้พูด</span>
                      <input
                        value={speaker.label}
                        maxLength={40}
                        onChange={(event) => onUpdateSpeaker(speaker.id, { label: event.target.value })}
                        disabled={!canEditSpeakers}
                      />
                    </label>
                    <label className="field grow">
                      <span>เสียง</span>
                      <select
                        value={speaker.voiceId}
                        onChange={(event) => onUpdateSpeaker(speaker.id, { voiceId: event.target.value })}
                        disabled={!canEditSpeakers || voices.length === 0}
                      >
                        <option value="">— เลือกเสียง —</option>
                        {voices.map((voice) => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name} ({voice.language})
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="secondary dubbing-speakers__remove"
                      type="button"
                      onClick={() => onRemoveSpeaker(speaker.id)}
                      disabled={!canEditSpeakers || speakerSlots.length <= 1}
                      aria-label={`ลบ ${speaker.label || "ผู้พูด"}`}
                    >
                      ลบ
                    </button>
                  </div>
                ))}
                {voices.length === 0 && (
                  <p className="hint">ยังไม่มี voice profile — เพิ่มเสียงในคลังเสียงก่อนเริ่ม render</p>
                )}
              </section>

              <div className="dubbing-transcript__selection-actions">
                <div>
                  <h4>เลือกช่วงสำหรับคลิปและ voice-over</h4>
                  <p className="hint">ช่วงที่เลือกติดกันจะรวมเป็นคลิปเดียว; ช่วงที่คั่นจะส่งออกเป็นคนละคลิป</p>
                </div>
                <div className="row">
                  <button className="secondary" type="button" onClick={onSelectAllSegments} disabled={selectionDisabled}>
                    เลือกทั้งหมด
                  </button>
                  <button className="secondary" type="button" onClick={onClearSegmentSelection} disabled={selectedSegmentIds.length === 0}>
                    ล้างการเลือก
                  </button>
                </div>
              </div>

              <div className="dubbing-transcript__list" role="list" aria-label="ช่วงข้อความถอดเสียง">
                {transcript.segments.map((segment, index) => (
                  <div className="dubbing-transcript__row" role="listitem" key={segment.id}>
                    <input
                      className="dubbing-transcript__checkbox"
                      type="checkbox"
                      aria-label={`เลือกช่วงที่ ${index + 1} สำหรับคลิปและ voice-over`}
                      checked={selectedIdSet.has(segment.id)}
                      onChange={(event) => onToggleSegment(segment.id, event.target.checked)}
                      disabled={selectionDisabled}
                    />
                    <span className="dubbing-transcript__time">
                      {formatTimestamp(segment.start)} – {formatTimestamp(segment.end)}
                    </span>
                    <select
                      className="dubbing-transcript__speaker"
                      aria-label={`ผู้พูดของช่วงที่ ${index + 1}`}
                      value={segmentSpeakers[segment.id] ?? ""}
                      onChange={(event) => onAssignSpeaker(segment.id, event.target.value)}
                      disabled={!canEditSpeakers || speakerSlots.length === 0}
                    >
                      {speakerSlots.map((speaker) => (
                        <option key={speaker.id} value={speaker.id}>
                          {speaker.label || speaker.id}
                        </option>
                      ))}
                    </select>
                    <p>{segment.text}</p>
                  </div>
                ))}
              </div>

              <section className="dubbing-clips" aria-label="ส่งออกคลิปและสร้าง voice-over">
                <div className="dubbing-clips__heading">
                  <div>
                    <h4>คลิปและ voice-over</h4>
                    <p className="hint">เลือกแล้ว {selectedSegments.length} ช่วง · {formatTimestamp(selectedDuration)}</p>
                  </div>
                  <div className="row">
                    <button
                      className="secondary"
                      type="button"
                      onClick={onExportClips}
                      disabled={!!clipDisabledReason || exportingClips}
                    >
                      {exportingClips ? "กำลังส่งออกคลิป…" : "⬇ ส่งออกคลิป + ซับ"}
                    </button>
                    <button
                      className="primary"
                      type="button"
                      onClick={onVoiceover}
                      disabled={!!voiceoverDisabledReason || generatingVoiceover}
                    >
                      {generatingVoiceover ? "กำลังสร้าง voice-over…" : "▶ สร้าง short voice-over"}
                    </button>
                  </div>
                </div>
                {clipDisabledReason && (
                  <p className="hint" role="status">{clipDisabledReason}</p>
                )}
                {voiceoverDisabledReason && selectedSegments.length > 0 && (
                  <p className="hint" role="status">{voiceoverDisabledReason}</p>
                )}

                {clipsJob && (
                  <div className="dubbing-render-result">
                    <h4>คลิปที่ส่งออก</h4>
                    <JobProgress job={clipsJob} />
                    {clipsJob.result?.analysis_job_id && clipsJob.result.analysis_job_id !== transcript.jobId && (
                      <p className="dubbing-transcript__notice dubbing-transcript__notice--stale" role="status">
                        คลิปนี้สร้างจาก transcript งานอื่น
                      </p>
                    )}
                    {clipsJob.status === "done" && clipsJob.result?.clips?.map((clip, index) => (
                      <article className="dubbing-clip-result" key={clip.output}>
                        <strong>คลิป {index + 1} · {clip.segment_ids.length} ช่วง · {formatTimestamp(clip.duration)}</strong>
                        <p>{clip.text}</p>
                        <audio controls preload="metadata" src={files.downloadUrl(basename(clip.output))} />
                        <div className="dubbing-transcript__downloads">
                          <a className="dl" href={files.downloadUrl(basename(clip.output))} download>⬇ เสียง WAV</a>
                          <a className="dl" href={files.downloadUrl(clip.subtitle_srt)} download>⬇ SRT snippet</a>
                          <a className="dl" href={files.downloadUrl(clip.subtitle_vtt)} download>⬇ VTT snippet</a>
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => {
                              onAddOutputToTimeline(clip.output);
                              setAddedOutputs((current) => ({ ...current, [clip.output]: true }));
                            }}
                            disabled={!!addedOutputs[clip.output]}
                          >
                            {addedOutputs[clip.output] ? "✓ เพิ่มใน Timeline แล้ว" : "＋ เพิ่มใน Timeline"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                {voiceoverJob && (
                  <div className="dubbing-render-result">
                    <h4>Short voice-over</h4>
                    <JobProgress job={voiceoverJob} />
                    {voiceoverJob.result?.analysis_job_id && voiceoverJob.result.analysis_job_id !== transcript.jobId && (
                      <p className="dubbing-transcript__notice dubbing-transcript__notice--stale" role="status">
                        voice-over นี้สร้างจาก transcript งานอื่น
                      </p>
                    )}
                    {voiceoverJob.status === "done" && voiceoverJob.result?.output && (
                      <div className="dubbing-clip-result">
                        <div className="dubbing-transcript__downloads">
                          {voiceoverJob.result.subtitle_srt && (
                            <a className="dl" href={files.downloadUrl(voiceoverJob.result.subtitle_srt)} download>⬇ SRT snippet</a>
                          )}
                          {voiceoverJob.result.subtitle_vtt && (
                            <a className="dl" href={files.downloadUrl(voiceoverJob.result.subtitle_vtt)} download>⬇ VTT snippet</a>
                          )}
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => {
                              onAddOutputToTimeline(voiceoverJob.result!.output!);
                              setAddedOutputs((current) => ({ ...current, [voiceoverJob.result!.output!]: true }));
                            }}
                            disabled={!!addedOutputs[voiceoverJob.result.output]}
                          >
                            {addedOutputs[voiceoverJob.result.output] ? "✓ เพิ่มใน Timeline แล้ว" : "＋ เพิ่มใน Timeline"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <div className="dubbing-multispeaker">
                <div>
                  <strong>Render {usedSpeakerIds.size || 1} ผู้พูด → {targetLang}</strong>
                  <p className="hint">
                    {translate ? "แปลข้อความก่อนพากย์" : "พากย์ด้วยข้อความต้นฉบับ"}
                    {" · ใช้ transcript ที่วิเคราะห์ไว้แล้ว"}
                  </p>
                </div>
                <button className="primary" type="button" onClick={onRender} disabled={renderDisabled}>
                  {rendering ? "กำลัง render…" : "▶ สร้างเสียงพากย์"}
                </button>
              </div>
              {renderDisabled && !rendering && renderDisabledReason && (
                <p className="hint" role="status">{renderDisabledReason}</p>
              )}

              {renderJob && (
                <div className="dubbing-render-result">
                  <h4>ผลการพากย์</h4>
                  <JobProgress job={renderJob} />
                  {renderJob.result?.analysis_job_id
                    && renderJob.result.analysis_job_id !== transcript.jobId && (
                    <p className="dubbing-transcript__notice dubbing-transcript__notice--stale" role="status">
                      ผลนี้มาจาก transcript job {renderJob.result.analysis_job_id}
                      {renderJob.result.source_audio ? ` ของไฟล์ “${renderJob.result.source_audio}”` : ""}
                      ; transcript ปัจจุบันเป็นคนละงาน
                    </p>
                  )}
                  {renderJob.status === "done" && renderJob.result?.output && (
                    <div className="dubbing-render-result__output">
                      <audio
                        controls
                        preload="metadata"
                        src={files.downloadUrl(basename(renderJob.result.output))}
                      />
                      <a className="dl" href={files.downloadUrl(basename(renderJob.result.output))} download>
                        ⬇ เสียงพากย์ (.wav)
                      </a>
                      {renderJob.result.video_output && (
                        <a className="dl" href={files.downloadUrl(basename(renderJob.result.video_output))} download>
                          ⬇ วิดีโอพากย์เสียง (.mp4)
                        </a>
                      )}
                      {renderJob.result.subtitle_srt && (
                        <a className="dl" href={files.downloadUrl(renderJob.result.subtitle_srt)} download>⬇ SRT</a>
                      )}
                      {renderJob.result.subtitle_vtt && (
                        <a className="dl" href={files.downloadUrl(renderJob.result.subtitle_vtt)} download>⬇ VTT</a>
                      )}
                      {renderJob.result.video_mux_error && (
                        <p className="hint">⚠ {renderJob.result.video_mux_error}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
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

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
