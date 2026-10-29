import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemixPanel } from "./RemixPanel";
import { EngineProvider } from "../store/engineContext";
import { useRemixStore } from "../store/useRemixStore";
import { jobs, music, type Job } from "../api";

vi.hoisted(() => { window.matchMedia = vi.fn().mockReturnValue({ matches: false }); });

// Keep the panel, recipe, engine, useJob and lifetime real; replace network and audio surfaces.
vi.mock("../api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../api")>(),
  music: { preview: vi.fn(), remix: vi.fn() },
  jobs: { watch: vi.fn(), get: vi.fn() },
}));
vi.mock("./StudioDock", () => ({ StudioDock: () => null }));
vi.mock("./LibraryPanel", () => ({ LibraryPanel: () => null }));
vi.mock("./Waveform", () => ({ Waveform: () => null }));

const payload = (id = "preview-a", expires = "2026-10-29T00:00:10Z") => ({
  preview_id: id, revision: 1,
  baseline: { source_bpm: 120, target_bpm: 120, global_stretch_rate: 1, beats_per_bar: 4, phrase_bars: 0, phase_offset_ms: 0, phrase_offset_sec: 0 },
  drift: { status: "drift_detected", confidence: 0.8, anchor_count: 2, span_bars: 8, residual_p95_ms: 100, end_drift_ms: 90, max_abs_drift_ms: 110, max_local_stretch_pct: 2 },
  anchors: [{ id: "a0", input_time_sec: 0, timeline_time_sec: 0, drift_ms: 0, confidence: 0.9, origin: "auto" }, { id: "a1", input_time_sec: 16, timeline_time_sec: 16.1, drift_ms: 100, confidence: 0.8, origin: "auto" }],
  warp_candidate: { available: true, accepted: false, map_digest: "warp-digest", reason: null },
  render_map_digests: { global_only: "global-digest", warp_candidate: "warp-digest" },
  audio_preview: { global_only_url: `/music/preview/${id}/1/global_only`, warp_candidate_url: `/music/preview/${id}/1/warp_candidate`, temporary: true, expires_at: expires },
});
let updateJob: (job: Job) => void;
const initialStore = useRemixStore.getState();
async function completePreview(id = "preview-a", expires?: string) {
  await act(async () => updateJob({ id: "job-preview", kind: "remix-preview", status: "done", progress: 1, message: "done", resource: "gpu", created_at: "x", updated_at: "x", result: payload(id, expires) }));
}
async function openPreview() {
  render(<EngineProvider><RemixPanel /></EngineProvider>);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Drift preview" })));
  await completePreview();
  expect(screen.getByRole("button", { name: "Accept warp and render" })).toBeTruthy();
}
function expectRetired() {
  expect(document.querySelector("audio")).toBe(null);
  expect(screen.queryByRole("button", { name: "Global only" })).toBe(null);
  expect(screen.queryByRole("button", { name: "Warp candidate" })).toBe(null);
  expect(screen.queryByRole("button", { name: "Accept warp and render" })).toBe(null);
  expect(screen.queryByRole("button", { name: "Render global-only" })).toBe(null);
  expect(screen.queryByRole("button", { name: /Apply manual anchors/ })).toBe(null);
  expect(screen.queryByRole("spinbutton", { name: "a0 destination time" })).toBe(null);
  expect(screen.getByRole("button", { name: "สร้าง preview ใหม่" })).toBeTruthy();
}

describe("expired preview recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T00:00:00Z"));
    vi.resetAllMocks(); localStorage.clear();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    useRemixStore.setState({ ...initialStore, source: "source.wav", beat: "beat.wav" });
    vi.mocked(music.preview).mockResolvedValue({ job_id: "job-preview", preview_id: "preview-a", revision: 1 });
    vi.mocked(jobs.watch).mockImplementation((_id, callback) => { updateJob = callback; return () => undefined; });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("hides expired controls while preserving inputs and regenerates without the old ID", async () => {
    await openPreview();
    act(() => vi.advanceTimersByTime(10_000));
    expectRetired();
    expect(screen.getByRole("status").textContent).toMatch(/หมดอายุ/);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "สร้าง preview ใหม่" })));
    const calls = vi.mocked(music.preview).mock.calls;
    const request = calls[calls.length - 1][0];
    expect(request).toMatchObject({ source_audio: "source.wav", beat_audio: "beat.wav", warp_mode: "suggest" });
    expect(request).not.toHaveProperty("preview_id");
    expect(request).not.toHaveProperty("base_revision");
    await completePreview("preview-b", "2026-10-29T00:01:00Z");
    expect(screen.queryByText(/หมดอายุ/)).toBe(null);
    expect(screen.getByRole("button", { name: "Accept warp and render" })).toBeTruthy();
    expect(document.querySelector("audio")?.src).toContain("preview-b");
  });

  it.each(["Render global-only", "Accept warp and render", "Apply manual anchors · new revision"])("handles server expiry from %s with actionable copy instead of raw 410", async (action) => {
    await openPreview();
    const error = new Error('410: {"detail":"preview_expired"}');
    vi.mocked(music.remix).mockRejectedValue(error);
    vi.mocked(music.preview).mockRejectedValueOnce(error);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: action })));
    expectRetired();
    expect(screen.getByRole("status").textContent).toMatch(/หมดอายุ/);
    expect(document.body.textContent).not.toMatch(/410|preview_expired/);
  });

  it("retires failed media with an unavailable message, not an expiry claim", async () => {
    await openPreview();
    fireEvent.error(document.querySelector("audio")!);
    expectRetired();
    expect(screen.getByRole("status").textContent).toMatch(/ไม่สามารถโหลด/);
    expect(screen.getByRole("status").textContent).not.toMatch(/หมดอายุ/);
  });

  it("keeps non-expiry failures visible without retiring a valid preview", async () => {
    await openPreview();
    vi.mocked(music.remix).mockRejectedValue(new Error("network failure"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Render global-only" })));
    expect(screen.getByText("network failure")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept warp and render" })).toBeTruthy();
  });

  it("handles expiry reported by an accepted background render job", async () => {
    await openPreview();
    vi.mocked(music.remix).mockResolvedValue({ job_id: "render-job" });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Accept warp and render" })));
    await act(async () => updateJob({ id: "render-job", kind: "remix", status: "error", progress: 0, message: "", error: "preview_expired", resource: "cpu", created_at: "x", updated_at: "x" }));
    expectRetired();
    expect(document.body.textContent).not.toContain("preview_expired");
  });

  it("leaves recovery retryable when generating a fresh preview fails", async () => {
    await openPreview();
    act(() => vi.advanceTimersByTime(10_000));
    vi.mocked(music.preview).mockRejectedValueOnce(new Error("network failure"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "สร้าง preview ใหม่" })));
    expect(screen.getByTitle("network failure")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Drift preview" }) as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector("audio")).toBe(null);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Drift preview" })));
    await completePreview("recovered", "2026-10-29T00:01:00Z");
    expect(screen.getByRole("button", { name: "Accept warp and render" })).toBeTruthy();
  });
});
