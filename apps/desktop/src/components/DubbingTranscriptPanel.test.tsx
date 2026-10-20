import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DubbingTranscriptPanel, type TranscriptResult } from "./DubbingTranscriptPanel";

const transcript: TranscriptResult = {
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
});
