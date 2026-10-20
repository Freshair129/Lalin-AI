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

    expect(screen.getByRole("status").textContent).toContain("interview.wav");
    expect(screen.getByRole("status").textContent).toContain("replacement.wav");
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
});
