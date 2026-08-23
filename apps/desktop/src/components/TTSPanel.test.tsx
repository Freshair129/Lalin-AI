import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { speech } from "../api";
import { TTSPanel } from "./TTSPanel";

vi.mock("../api", () => ({
  speech: { getConfig: vi.fn() },
  tts: { synth: vi.fn() },
  voices: { list: vi.fn().mockResolvedValue({ voices: [] }) },
}));
vi.mock("../useJob", () => ({
  useJob: () => ({ job: null, busy: false, start: vi.fn() }),
}));
vi.mock("../store/engineContext", () => ({
  useEngine: () => ({ project: { tracks: [] }, addAsset: vi.fn(), addClip: vi.fn() }),
}));

describe("TTSPanel lite availability", () => {
  it("shows a Thai availability explanation instead of offering a broken request", async () => {
    vi.mocked(speech.getConfig).mockResolvedValue({
      asr_model: "large-v3", asr_device: "auto", asr_compute_type: "auto",
      profiles: [], asr_available: false, tts_available: false,
    });

    render(<TTSPanel />);

    await waitFor(() => expect(screen.getByText(
      "Lite runtime ยังไม่รวมโมเดลสร้างเสียง — ติดตั้ง Full runtime เพื่อใช้ Text to speech",
    )).toBeTruthy());
    expect((screen.getByRole("button", {
      name: "Text to speech ยังไม่พร้อมใน Lite runtime",
    }) as HTMLButtonElement).disabled).toBe(true);
  });
});
