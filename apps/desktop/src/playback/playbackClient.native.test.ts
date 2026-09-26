import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  resolve: vi.fn(),
  open: vi.fn(),
  studioSend: vi.fn(),
  studioConnect: vi.fn(),
  studioReconcile: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
vi.mock("../api", () => ({ files: { resolveForPlayback: native.resolve } }));
vi.mock("./windowManager", () => ({ isTauri: () => true, openOrFocusPlayWindow: native.open }));
vi.mock("./playbackBridge", () => ({
  createPlaybackClient: () => ({
    send: native.studioSend,
    connect: native.studioConnect,
    reconcile: native.studioReconcile,
  }),
}));

import { reconcilePlayback, requestPlayback, requestStandalonePlayback } from "./playbackClient";

function reply(requestId: string, title: string) {
  return {
    ack: { type: "ACK", requestId, ownerSession: "owner", result: "applied", revision: 1 },
    state: {
      type: "STATE",
      ownerSession: "owner",
      revision: 1,
      snapshot: {
        nowPlaying: { identity: title, title, state: "loading", position: 0, duration: 0, error: null },
        queue: [], currentIndex: -1, volume: 1, muted: false, eq: null,
      },
    },
  };
}

const item = (id: string) => ({
  id,
  title: id,
  url: "http://127.0.0.1:8756/fs/file?path=untrusted-url-is-ignored",
  sourceKind: "workspace" as const,
  sourcePath: `${id}.wav`,
});

describe("native Studio-to-Play sender", () => {
  beforeEach(() => {
    native.invoke.mockReset();
    native.resolve.mockReset();
    native.open.mockReset();
    native.studioSend.mockReset().mockResolvedValue(undefined);
    native.studioConnect.mockReset();
    native.studioReconcile.mockReset();
    native.resolve.mockImplementation(async (_kind: string, path: string) => ({ path: `C:\\workspace\\${path}` }));
    native.invoke.mockImplementation(async (command: string, args: any) => {
      if (command === "handoff_playback") return reply(args.requestId, args.file.title);
      if (command === "get_playback_state") return null;
      if (command === "reconcile_playback_handoff") return reply("00000000-0000-4000-8000-000000000001", "reconciled");
      return undefined;
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
  });

  afterEach(() => {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
  });

  it("keeps existing Studio commands on the current player until parity is proven", () => {
    requestPlayback({ type: "PLAY", item: item("studio") });
    expect(native.studioSend).toHaveBeenCalledWith({ type: "PLAY", item: item("studio") });
    expect(native.invoke).not.toHaveBeenCalled();
  });

  it("serializes explicit standalone handoff actions and sends only backend-resolved local paths", async () => {
    requestStandalonePlayback({ type: "PLAY", item: item("first") });
    requestStandalonePlayback({ type: "PLAY_NEXT", item: item("second") });
    requestStandalonePlayback({ type: "ADD_TO_QUEUE", item: item("third") });

    await vi.waitFor(() => {
      expect(native.invoke.mock.calls.filter(([name]) => name === "handoff_playback")).toHaveLength(3);
    });
    const sent = native.invoke.mock.calls
      .filter(([name]) => name === "handoff_playback")
      .map(([, args]) => args);
    expect(sent.map((args) => args.action)).toEqual(["play", "play-next", "add-to-queue"]);
    expect(sent.map((args) => args.file.path)).toEqual([
      "C:\\workspace\\first.wav",
      "C:\\workspace\\second.wav",
      "C:\\workspace\\third.wav",
    ]);
    expect(sent[0].file.path).not.toContain("untrusted-url-is-ignored");
    expect(native.open).not.toHaveBeenCalled();
    expect(native.studioSend).not.toHaveBeenCalled();
  });

  it("keeps unknown delivery blocked until the exact native reconciliation command returns", async () => {
    native.invoke.mockImplementation(async (command: string, args: any) => {
      if (command === "handoff_playback") throw new Error("delivery_unknown: ACK unavailable");
      if (command === "reconcile_playback_handoff") return reply(args?.requestId ?? "00000000-0000-4000-8000-000000000001", "reconciled");
      return undefined;
    });
    requestStandalonePlayback({ type: "PLAY", item: item("uncertain") });
    await vi.waitFor(() => expect(native.invoke.mock.calls.some(([name]) => name === "handoff_playback")).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 0));

    await reconcilePlayback();

    expect(native.invoke).toHaveBeenCalledWith("reconcile_playback_handoff");
    expect(native.invoke).not.toHaveBeenCalledWith("get_playback_state");
  });
});
