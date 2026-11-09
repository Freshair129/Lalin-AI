import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider, STORAGE_LOCALE_KEY } from "../i18n";
import { PlaybackSettings } from "./PlaybackSettings";

const settingsStore = vi.hoisted(() => ({
  state: {} as Record<string, any>,
  setTransitionSettings: vi.fn(),
  setExperimentalSmartMedley: vi.fn(),
  refreshOutputDevices: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../playback/usePlaybackStore", () => {
  const hook = (selector: (state: Record<string, any>) => unknown) => selector(settingsStore.state);
  return {
    usePlaybackStore: Object.assign(hook, {
      getState: () => settingsStore.state,
    }),
  };
});

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn().mockResolvedValue(null) }));

function renderSettings(locale: "en" | "th" = "en") {
  localStorage.clear();
  if (locale === "th") localStorage.setItem(STORAGE_LOCALE_KEY, "th");
  return render(
    <I18nProvider>
      <PlaybackSettings report={vi.fn()} />
    </I18nProvider>,
  );
}

function setSettingsState(overrides: Record<string, unknown> = {}) {
  const current = {
    availableOutputDevices: [],
    nowPlaying: { activeOutputDeviceId: "", playbackRate: 1, state: "playing" },
    queue: {
      items: [
        { id: "current", queueEntryId: "entry-current", title: "Current song", duration: 100 },
        { id: "next", queueEntryId: "entry-next", title: "Next song", duration: 120 },
      ],
      currentIndex: 0,
      repeatMode: "off",
      shuffle: false,
    },
    transitionSettings: { mode: "smooth", durationSeconds: 5 },
    experimental: { smartMedley: false },
    smartMedleyStatus: { phase: "idle", key: null },
    isTransitioning: false,
    crossfader: 0,
    transitionTargetQueueEntryId: null,
    setTransitionSettings: settingsStore.setTransitionSettings,
    setExperimentalSmartMedley: settingsStore.setExperimentalSmartMedley,
    refreshOutputDevices: settingsStore.refreshOutputDevices,
    ...overrides,
  };
  settingsStore.state = current;
}

beforeEach(() => {
  settingsStore.setTransitionSettings.mockClear();
  settingsStore.setExperimentalSmartMedley.mockClear();
  settingsStore.refreshOutputDevices.mockClear();
  setSettingsState();
});

afterEach(() => cleanup());

describe("Smart Medley settings and status", () => {
  it("hides Smart Medley while the experimental gate is off", () => {
    renderSettings();

    expect(screen.queryByRole("option", { name: "Smart Medley (Experimental)" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Experimental" })).not.toBeNull();
  });

  it("shows and selects Smart Medley after enabling the experimental gate", () => {
    setSettingsState({ experimental: { smartMedley: true } });
    renderSettings();

    const mode = screen.getByRole("combobox", { name: "Track transition" });
    expect(screen.getByRole("option", { name: "Smart Medley (Experimental)" })).not.toBeNull();
    fireEvent.change(mode, { target: { value: "smart" } });
    expect(settingsStore.setTransitionSettings).toHaveBeenCalledWith({ mode: "smart", durationSeconds: 5 });
    expect(screen.getByRole("checkbox", { name: "Smart Medley" })).not.toBeNull();
  });

  it.each([
    ["en", "analyzing", undefined, "Analysing this pair…"],
    ["th", "analyzing", undefined, "กำลังวิเคราะห์คู่นี้…"],
    ["en", "match", undefined, "Smart Medley match (score 0.82)"],
    ["th", "match", undefined, "จับคู่ Smart Medley ได้ (คะแนน 0.82)"],
    ["en", "fallback", "bpm-confidence-below-0.80", "Using smooth crossfade: BPM confidence is below 0.80."],
    ["th", "fallback", "bpm-confidence-below-0.80", "ใช้การเฟดเสียงแบบ Smooth: ความเชื่อมั่น BPM ต่ำกว่า 0.80"],
    ["en", "fallback", "key-confidence-below-0.75", "Key confidence is below 0.75."],
    ["en", "fallback", "cue-confidence-below-0.80", "Cue confidence is below 0.80."],
    ["en", "fallback", "tempo-ratio-above-1.03", "The tempo ratio is above 1.03."],
    ["en", "fallback", "incompatible-key", "The estimated keys are not compatible."],
    ["en", "fallback", "compatibility-score-below-0.70", "The compatibility score is below 0.70."],
    ["en", "fallback", "unsupported-media", "One of these tracks is not supported for analysis."],
    ["en", "fallback", "unreadable-media", "A track could not be read for analysis."],
    ["en", "fallback", "stale-analysis-version", "The track changed or its analysis is out of date."],
    ["en", "fallback", "future-native-reason", "Using smooth crossfade: Analysis unavailable."],
    ["th", "fallback", "future-native-reason", "ใช้การเฟดเสียงแบบ Smooth: ไม่สามารถวิเคราะห์ได้"],
  ] as const)("renders the %s %s status for a Smart Medley pair", (locale, phase, reason, expected) => {
    setSettingsState({
      transitionSettings: { mode: "smart", durationSeconds: 5 },
      experimental: { smartMedley: true },
      smartMedleyStatus: {
        phase,
        key: "entry-current:entry-next:10:[]",
        currentEntryId: "entry-current",
        nextEntryId: "entry-next",
        reason,
        decision: phase === "match"
          ? { score: { compatibilityScore: 0.82 } }
          : undefined,
      },
    });
    renderSettings(locale);

    // <output> also has the implicit "status" role; select the pair-status paragraph.
    const status = screen.getAllByRole("status").find((element) => element.tagName === "P")!;
    expect(status.textContent).toContain("Current song → Next song");
    expect(status.textContent).toContain(expected);
  });

  it("persists an enabled gate through the store action", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("checkbox", { name: "Smart Medley" }));

    expect(settingsStore.setExperimentalSmartMedley).toHaveBeenCalledWith(true);
  });
});
