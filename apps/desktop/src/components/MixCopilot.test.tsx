import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MixCopilot } from "./MixCopilot";
import { agent } from "../api";
import type { ClipEngine } from "../timeline/useClipEngine";

vi.mock("../api", () => ({ agent: { act: vi.fn() }, voices: { list: vi.fn().mockResolvedValue({ voices: [] }) }, speech: { getConfig: vi.fn().mockResolvedValue({ tts_available: false }) }, tts: { synth: vi.fn() } }));
vi.mock("../useJob", () => ({ useJob: () => ({ job: null, busy: false, start: vi.fn() }) }));

describe("agent sidebar conversation", () => {
  beforeEach(() => vi.clearAllMocks());
  it("sends the message with the current project and shows the agent response", async () => {
    vi.mocked(agent.act).mockResolvedValue({ reply: "Ready to mix", mutations: [] });
    const project = { tracks: [] };
    render(<MixCopilot sidebar engine={{ project } as unknown as ClipEngine} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Message agent" }), { target: { value: "Help mix" } });
    fireEvent.click(screen.getByRole("button", { name: "ส่ง" }));
    await waitFor(() => expect(screen.getByText("Ready to mix")).toBeTruthy());
    expect(agent.act).toHaveBeenCalledWith("Help mix", project, []);
    fireEvent.change(screen.getByRole("textbox", { name: "Message agent" }), { target: { value: "What next?" } });
    fireEvent.click(screen.getByRole("button", { name: "ส่ง" }));
    await waitFor(() => expect(agent.act).toHaveBeenCalledTimes(2));
    expect(agent.act).toHaveBeenLastCalledWith("What next?", project, [
      { role: "user", content: "Help mix" }, { role: "assistant", content: "Ready to mix" },
    ]);
  });
  it("shows an error when the agent request fails", async () => {
    vi.mocked(agent.act).mockRejectedValueOnce(new Error("agent unavailable")).mockResolvedValueOnce({ reply: "ok", mutations: [] });
    render(<MixCopilot sidebar engine={{ project: {} } as unknown as ClipEngine} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Message agent" }), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "ส่ง" }));
    await waitFor(() => expect(screen.getByText(/agent unavailable/)).toBeTruthy());
    fireEvent.change(screen.getByRole("textbox", { name: "Message agent" }), { target: { value: "Try again" } });
    fireEvent.click(screen.getByRole("button", { name: "ส่ง" }));
    await waitFor(() => expect(screen.getByText("ok")).toBeTruthy());
    expect(vi.mocked(agent.act).mock.calls[1][2]).toEqual([]);
  });
});
