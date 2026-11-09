import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { SmartMedleyPairDecision } from "./contracts";
import { analyzeSmartMedleyPair } from "./native";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn(),
  invoke: vi.fn(),
}));

describe("Smart Medley native command wrapper", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("sends the exact pair, smooth flag, and cue overrides to the native analyzer", async () => {
    const decision = { mode: "smart-medley", eligible: true } as SmartMedleyPairDecision;
    vi.mocked(invoke).mockResolvedValue(decision as never);

    const result = await analyzeSmartMedleyPair(
      "current-track",
      "next-track",
      true,
      { cueInSeconds: 3, cueOutSeconds: 90 },
      { cueInSeconds: 12, cueOutSeconds: undefined },
    );

    expect(invoke).toHaveBeenCalledWith("analyze_smart_medley_pair", {
      currentId: "current-track",
      nextId: "next-track",
      smoothEnabled: true,
      currentUserCues: { cueInSeconds: 3, cueOutSeconds: 90 },
      nextUserCues: { cueInSeconds: 12, cueOutSeconds: undefined },
    });
    expect(result).toBe(decision);
  });
});
