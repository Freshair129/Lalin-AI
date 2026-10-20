import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Job } from "../api";
import { DubbingTranscriptPanel, type TranscriptResult } from "./DubbingTranscriptPanel";

const transcript: TranscriptResult = {
  jobId: "analysis-1",
  sourceAudio: "interview.wav",
  detectedLanguage: "th",
  segmentCount: 1,
  durationSec: 12.34,
  segments: [{ id: "seg_000001", start: 1.25, end: 2.5, text: "สวัสดีครับ" }],
  subtitleSrt: "transcript.srt",
  subtitleVtt: "transcript.vtt",
};

describe("DubbingTranscriptPanel", () => {
  it("shows timestamped transcript rows and subtitle downloads", () => {
    render(
      <DubbingTranscriptPanel
        source="interview.wav"
        uploading={false}
        analyzing={false}
        job={null}
        transcript={transcript}
        onAnalyze={() => undefined}
      />,
    );

    expect(screen.getByText("00:00:01.25 – 00:00:02.50")).toBeTruthy();
    expect(screen.getByText("สวัสดีครับ")).toBeTruthy();
    expect(screen.getByText("ภาษาที่ตรวจพบ")).toBeTruthy();
    expect(screen.getByRole("link", { name: "⬇ SRT" }).getAttribute("download")).not.toBeNull();
    expect(screen.getByRole("link", { name: "⬇ VTT" }).getAttribute("download")).not.toBeNull();
  });

  it("identifies a transcript from a different current source and allows reanalysis", () => {
    const onAnalyze = vi.fn();
    render(
      <DubbingTranscriptPanel
        source="replacement.wav"
        uploading={false}
        analyzing={false}
        job={null}
        transcript={transcript}
        onAnalyze={onAnalyze}
      />,
    );

    const staleNotice = screen.getByText(/ผลด้านล่างเป็นของไฟล์/);
    expect(staleNotice.textContent).toContain("interview.wav");
    expect(staleNotice.textContent).toContain("replacement.wav");
    expect(screen.queryByRole("link", { name: "⬇ SRT" })).toBeNull();
    expect(screen.queryByRole("link", { name: "⬇ VTT" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "วิเคราะห์ Transcript" }));
    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });

  it("disables analysis until a source is selected or while analysis is running", () => {
    const { rerender } = render(
      <DubbingTranscriptPanel
        source={null}
        uploading={false}
        analyzing={false}
        job={null}
        transcript={null}
        onAnalyze={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "วิเคราะห์ Transcript" }).hasAttribute("disabled")).toBe(true);

    rerender(
      <DubbingTranscriptPanel
        source="interview.wav"
        uploading={false}
        analyzing={true}
        job={null}
        transcript={null}
        onAnalyze={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "กำลังวิเคราะห์…" }).hasAttribute("disabled")).toBe(true);
  });

  it("assigns transcript segments to speakers and renders when voice mappings are complete", () => {
    const onAssignSpeaker = vi.fn();
    const onRender = vi.fn();
    render(
      <DubbingTranscriptPanel
        source="interview.wav"
        uploading={false}
        analyzing={false}
        job={null}
        transcript={transcript}
        voices={[
          { id: "voice_a", name: "เสียง A", language: "th", ref_text: "" },
          { id: "voice_b", name: "เสียง B", language: "th", ref_text: "" },
        ]}
        speakerSlots={[
          { id: "spk_a", label: "ผู้พูด A", voiceId: "voice_a" },
          { id: "spk_b", label: "ผู้พูด B", voiceId: "voice_b" },
        ]}
        segmentSpeakers={{ seg_000001: "spk_a" }}
        renderDisabled={false}
        targetLang="English"
        onAnalyze={() => undefined}
        onAssignSpeaker={onAssignSpeaker}
        onRender={onRender}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "ผู้พูดของช่วงที่ 1" }), {
      target: { value: "spk_b" },
    });
    expect(onAssignSpeaker).toHaveBeenCalledWith("seg_000001", "spk_b");

    const renderButton = screen.getByRole("button", { name: "▶ สร้างเสียงพากย์" });
    expect(renderButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(renderButton);
    expect(onRender).toHaveBeenCalledTimes(1);
  });

  it("selects transcript ranges and enables clip export and mapped voice-over actions", () => {
    const onToggleSegment = vi.fn();
    const onExportClips = vi.fn();
    const onVoiceover = vi.fn();
    render(
      <DubbingTranscriptPanel
        source="interview.wav"
        uploading={false}
        analyzing={false}
        job={null}
        transcript={transcript}
        voices={[{ id: "voice_a", name: "เสียง A", language: "th", ref_text: "" }]}
        speakerSlots={[{ id: "spk_a", label: "ผู้พูด A", voiceId: "voice_a" }]}
        segmentSpeakers={{ seg_000001: "spk_a" }}
        selectedSegmentIds={["seg_000001"]}
        onAnalyze={() => undefined}
        onToggleSegment={onToggleSegment}
        onExportClips={onExportClips}
        onVoiceover={onVoiceover}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: "เลือกช่วงที่ 1 สำหรับคลิปและ voice-over" });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    fireEvent.click(checkbox);
    expect(onToggleSegment).toHaveBeenCalledWith("seg_000001", false);

    const exportButton = screen.getByRole("button", { name: "⬇ ส่งออกคลิป + ซับ" });
    const voiceoverButton = screen.getByRole("button", { name: "▶ สร้าง short voice-over" });
    expect((exportButton as HTMLButtonElement).disabled).toBe(false);
    expect((voiceoverButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(exportButton);
    fireEvent.click(voiceoverButton);
    expect(onExportClips).toHaveBeenCalledTimes(1);
    expect(onVoiceover).toHaveBeenCalledTimes(1);
  });

  it("previews, downloads, and adds exported clip and voice-over audio to the timeline", () => {
    const onAddOutputToTimeline = vi.fn();
    const common = {
      status: "done" as const,
      progress: 1,
      message: "เสร็จสมบูรณ์",
      resource: "cpu" as const,
      created_at: "2026-10-20T00:00:00Z",
      updated_at: "2026-10-20T00:00:01Z",
      result: { analysis_job_id: "analysis-1" },
    };
    const clipsJob: Job = {
      ...common,
      id: "clips-1",
      kind: "dubbing-clips",
      result: {
        ...common.result,
        clips: [{
          output: "/outputs/clip.wav",
          subtitle_srt: "clip.srt",
          subtitle_vtt: "clip.vtt",
          segment_ids: ["seg_000001"],
          start: 1.25,
          end: 2.5,
          duration: 1.25,
          text: "สวัสดีครับ",
        }],
      },
    };
    const voiceoverJob: Job = {
      ...common,
      id: "voiceover-1",
      kind: "dubbing-voiceover",
      result: {
        ...common.result,
        output: "/outputs/voiceover.wav",
        subtitle_srt: "voiceover.srt",
        subtitle_vtt: "voiceover.vtt",
      },
    };
    const { container } = render(
      <DubbingTranscriptPanel
        source="interview.wav"
        uploading={false}
        analyzing={false}
        job={null}
        transcript={transcript}
        clipsJob={clipsJob}
        voiceoverJob={voiceoverJob}
        onAnalyze={() => undefined}
        onAddOutputToTimeline={onAddOutputToTimeline}
      />,
    );

    expect(container.querySelectorAll("audio[controls]")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "⬇ เสียง WAV" }).getAttribute("download")).not.toBeNull();
    expect(screen.getByRole("link", { name: "⬇ ดาวน์โหลด voiceover.wav" }).getAttribute("download")).not.toBeNull();
    const subtitleLinks = screen.getAllByRole("link", { name: "⬇ SRT snippet" });
    expect(subtitleLinks.some((link) => link.getAttribute("href")?.includes("clip.srt"))).toBe(true);
    expect(screen.getAllByRole("link", { name: "⬇ VTT snippet" })).toHaveLength(2);
    const addButtons = screen.getAllByRole("button", { name: "＋ เพิ่มใน Timeline" });
    fireEvent.click(addButtons[0]);
    fireEvent.click(addButtons[1]);
    expect(onAddOutputToTimeline.mock.calls).toEqual([
      ["/outputs/clip.wav"],
      ["/outputs/voiceover.wav"],
    ]);
  });
});
