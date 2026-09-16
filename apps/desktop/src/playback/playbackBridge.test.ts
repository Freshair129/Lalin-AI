import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@lalin/contracts";
import {
  createPlaybackClient,
  createPlaybackOwner,
  type PlaybackClientState,
  type PlaybackCommand,
  type PlaybackSnapshot,
} from "./playbackBridge";

const CHANNEL_NAME = "lalin:playback:bridge";

type MessageRecord = { data: unknown };

function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * A small asynchronous BroadcastChannel implementation. It deliberately keeps
 * sender isolation and structured-clone semantics so the tests exercise the
 * bridge protocol rather than sharing object references in-process.
 */
class AsyncBroadcastChannel {
  static peers = new Map<string, Set<AsyncBroadcastChannel>>();
  static history: MessageRecord[] = [];
  static dropNext: ((data: unknown) => boolean) | null = null;

  readonly name: string;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  private closed = false;

  constructor(name: string) {
    this.name = name;
    const peers = AsyncBroadcastChannel.peers.get(name) ?? new Set();
    peers.add(this);
    AsyncBroadcastChannel.peers.set(name, peers);
  }

  postMessage(data: unknown) {
    if (this.closed) throw new Error("channel is closed");
    const payload = clone(data);
    AsyncBroadcastChannel.history.push({ data: payload });
    const recipients = [...(AsyncBroadcastChannel.peers.get(this.name) ?? [])]
      .filter((peer) => peer !== this);
    queueMicrotask(() => {
      for (const peer of recipients) {
        if (peer.closed) continue;
        if (AsyncBroadcastChannel.dropNext?.(payload)) {
          AsyncBroadcastChannel.dropNext = null;
          continue;
        }
        peer.onmessage?.({ data: clone(payload) } as MessageEvent<unknown>);
      }
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    AsyncBroadcastChannel.peers.get(this.name)?.delete(this);
  }

  static reset() {
    for (const peers of AsyncBroadcastChannel.peers.values()) {
      for (const peer of peers) peer.closed = true;
    }
    AsyncBroadcastChannel.peers.clear();
    AsyncBroadcastChannel.history = [];
    AsyncBroadcastChannel.dropNext = null;
  }
}

async function settleMessages() {
  // Protocol delivery can cascade owner -> client -> owner -> client.
  for (let i = 0; i < 8; i += 1) {
    await new Promise<void>((resolve) => queueMicrotask(resolve));
  }
}

function last<T>(values: T[]): T | undefined {
  return values[values.length - 1];
}

async function postRaw(data: unknown) {
  const channel = new AsyncBroadcastChannel(CHANNEL_NAME);
  channel.postMessage(data);
  channel.close();
  await settleMessages();
}

function item(id: string): MediaItem {
  return {
    id,
    title: `Track ${id}`,
    url: `https://example.test/${id}.mp3`,
    sourceKind: "workspace",
    sourcePath: `${id}.mp3`,
    ext: "mp3",
  };
}

function snapshot(nextItem: MediaItem | null, state: PlaybackSnapshot["state"] = "idle", error?: string): PlaybackSnapshot {
  return error === undefined
    ? { item: nextItem, state }
    : { item: nextItem, state, error };
}

function messageType(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
  const type = (data as { type?: unknown }).type;
  return typeof type === "string" ? type : undefined;
}

function lastMessage(type: string): Record<string, unknown> {
  const record = [...AsyncBroadcastChannel.history]
    .reverse()
    .find((entry) => messageType(entry.data) === type)?.data;
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    throw new Error(`No ${type} message was posted`);
  }
  return record as Record<string, unknown>;
}

interface Harness {
  client: ReturnType<typeof createPlaybackClient>;
  owner: ReturnType<typeof createPlaybackOwner>;
  open: ReturnType<typeof vi.fn<( ) => Promise<boolean>>>;
  executeCalls: PlaybackCommand[];
  states: PlaybackClientState[];
  getOwnerSnapshot: () => PlaybackSnapshot;
}

function createHarness(options: {
  ownerInitiallyConnected?: boolean;
  openResult?: boolean;
  execute?: (command: PlaybackCommand) => void | Promise<void>;
  initialSnapshot?: PlaybackSnapshot;
} = {}): Harness {
  let current = options.initialSnapshot ?? snapshot(null);
  const executeCalls: PlaybackCommand[] = [];
  let ownerConnected = false;
  const owner = createPlaybackOwner({
    getSnapshot: () => current,
    execute: async (command) => {
      executeCalls.push(command);
      if (options.execute) {
        await options.execute(command);
        return;
      }
      if (command.type === "PLAY") current = snapshot(command.item, "playing");
    },
  });
  const open = vi.fn(async () => {
    if (options.openResult === false) return false;
    if (!ownerConnected) {
      owner.connect();
      ownerConnected = true;
    }
    return true;
  });
  if (options.ownerInitiallyConnected) {
    owner.connect();
    ownerConnected = true;
  }

  const states: PlaybackClientState[] = [];
  const client = createPlaybackClient({
    open,
    onState: (next) => states.push(next),
  });
  client.connect();

  return {
    client,
    owner,
    open,
    executeCalls,
    states,
    getOwnerSnapshot: () => current,
  };
}

function disposeHarness(harness: Harness) {
  harness.client.dispose();
  harness.owner.dispose();
}

beforeEach(() => {
  AsyncBroadcastChannel.reset();
  vi.stubGlobal("BroadcastChannel", AsyncBroadcastChannel);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  AsyncBroadcastChannel.reset();
});

describe("playback bridge delivery contract", () => {
  it("keeps the listener alive before a cold open and delivers one PLAY after READY", async () => {
    let releaseOpen!: () => void;
    let ownerDisconnect: (() => void) | undefined;
    const ownerSnapshot = snapshot(null);
    const executeCalls: PlaybackCommand[] = [];
    const owner = createPlaybackOwner({
      getSnapshot: () => ownerSnapshot,
      execute: (command) => { executeCalls.push(command); },
    });
    const states: PlaybackClientState[] = [];
    const open = vi.fn(() => new Promise<boolean>((resolve) => {
      releaseOpen = () => {
        // The owner is mounted after the popup opens, like a delayed React
        // listener in the Play Window.
        ownerDisconnect = owner.connect();
        resolve(true);
      };
    }));
    const client = createPlaybackClient({ open, onState: (next) => states.push(next) });
    client.connect();

    const delivered = client.send({ type: "PLAY", item: item("cold") });
    expect(open).toHaveBeenCalledTimes(1);
    expect(executeCalls).toEqual([]);
    releaseOpen();
    await expect(delivered).resolves.toBeUndefined();
    expect(executeCalls).toEqual([{ type: "PLAY", item: item("cold") }]);
    expect(last(states)?.pending).toBe(false);
    expect(last(states)?.nowPlaying).toEqual(ownerSnapshot);

    client.dispose();
    ownerDisconnect?.();
    owner.dispose();
  });

  it("reuses a warm owner and keeps FOCUS_PLAYER free of playback duplication", async () => {
    const harness = createHarness({ ownerInitiallyConnected: true });
    await expect(harness.client.send({ type: "PLAY", item: item("warm") })).resolves.toBeUndefined();
    await expect(harness.client.send({ type: "FOCUS_PLAYER" })).resolves.toBeUndefined();

    expect(harness.open).toHaveBeenCalledTimes(2);
    expect(harness.executeCalls).toEqual([
      { type: "PLAY", item: item("warm") },
      { type: "FOCUS_PLAYER" },
    ]);
    disposeHarness(harness);
  });

  it("accepts rapid commands in click order and does not turn queue-only commands into PLAY", async () => {
    const harness = createHarness({ ownerInitiallyConnected: true });
    const a = item("a");
    const b = item("b");
    const c = item("c");
    const results = [
      harness.client.send({ type: "PLAY", item: a }),
      harness.client.send({ type: "PLAY_NEXT", item: b }),
      harness.client.send({ type: "ADD_TO_QUEUE", item: c }),
    ];
    await expect(Promise.all(results)).resolves.toEqual([undefined, undefined, undefined]);

    expect(harness.executeCalls).toEqual([
      { type: "PLAY", item: a },
      { type: "PLAY_NEXT", item: b },
      { type: "ADD_TO_QUEUE", item: c },
    ]);
    expect(harness.getOwnerSnapshot().state).toBe("playing");
    disposeHarness(harness);
  });

  it("deduplicates the same client command ID and returns an acknowledgement again", async () => {
    const harness = createHarness({ ownerInitiallyConnected: true });
    const command = { type: "PLAY", item: item("once") } as const;
    await expect(harness.client.send(command)).resolves.toBeUndefined();
    const firstWireCommand = clone(lastMessage("COMMAND"));
    const acksBeforeDuplicate = AsyncBroadcastChannel.history.filter(
      (entry) => messageType(entry.data) === "ACK",
    ).length;

    await postRaw(firstWireCommand);
    expect(harness.executeCalls).toEqual([command]);
    expect(AsyncBroadcastChannel.history.filter((entry) => messageType(entry.data) === "ACK")).toHaveLength(
      acksBeforeDuplicate + 1,
    );
    disposeHarness(harness);
  });

  it("repeats the exact duplicate ACK and publishes current state separately", async () => {
    let current = snapshot(null);
    let acknowledgedSnapshot: PlaybackSnapshot | undefined;
    const executeCalls: PlaybackCommand[] = [];
    const owner = createPlaybackOwner({
      getSnapshot: () => current,
      execute: (command) => {
        executeCalls.push(command);
        if (command.type === "PLAY") {
          current = snapshot(command.item, "playing");
          acknowledgedSnapshot = current;
        }
      },
    });
    owner.connect();
    const states: PlaybackClientState[] = [];
    const client = createPlaybackClient({
      open: vi.fn(async () => true),
      onState: (next) => states.push(next),
    });
    client.connect();

    const command = { type: "PLAY", item: item("once-exact") } as const;
    await expect(client.send(command)).resolves.toBeUndefined();
    const firstWireCommand = clone(lastMessage("COMMAND"));
    const firstAck = clone(lastMessage("ACK"));

    acknowledgedSnapshot!.item!.title = "mutated-after-ack";
    current = snapshot(item("later-state"), "paused");
    await postRaw(firstWireCommand);

    const duplicateAck = lastMessage("ACK");
    expect(duplicateAck).toEqual(firstAck);
    expect(lastMessage("STATE").snapshot).toEqual(current);
    expect(last(states)?.nowPlaying).toEqual(current);
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]).toMatchObject({ type: "PLAY", item: { id: "once-exact" } });

    client.dispose();
    owner.dispose();
  });

  it("adopts an idle reloaded owner during reconciliation and accepts its STATE", async () => {
    const first = createPlaybackOwner({
      getSnapshot: () => snapshot(item("before-reload"), "paused"),
      execute: () => undefined,
    });
    first.connect();
    const states: PlaybackClientState[] = [];
    const open = vi.fn(async () => true);
    const client = createPlaybackClient({ open, onState: (next) => states.push(next) });
    client.connect();
    await settleMessages();

    first.dispose();
    let current = snapshot(item("after-reload"), "playing");
    const reloaded = createPlaybackOwner({
      getSnapshot: () => current,
      execute: () => undefined,
    });
    reloaded.connect();
    client.reconcile();
    await settleMessages();

    expect(open).toHaveBeenCalledTimes(1);
    expect(last(states)?.nowPlaying).toEqual(current);

    current = snapshot(item("after-state"), "paused");
    reloaded.publish();
    await settleMessages();
    expect(last(states)?.nowPlaying).toEqual(current);

    client.dispose();
    reloaded.dispose();
  });

  it("opens synchronously for reconciliation without creating or replaying a command", async () => {
    let releaseOpen!: (opened: boolean) => void;
    const open = vi.fn(() => new Promise<boolean>((resolve) => { releaseOpen = resolve; }));
    const states: PlaybackClientState[] = [];
    const client = createPlaybackClient({ open, onState: (next) => states.push(next) });
    client.connect();
    const historyBefore = AsyncBroadcastChannel.history.length;

    client.reconcile();

    expect(open).toHaveBeenCalledTimes(1);
    expect(AsyncBroadcastChannel.history.slice(historyBefore).filter((entry) => messageType(entry.data) === "COMMAND")).toHaveLength(0);
    expect(AsyncBroadcastChannel.history.slice(historyBefore).filter((entry) => messageType(entry.data) === "HELLO")).toHaveLength(0);

    releaseOpen(true);
    await settleMessages();
    expect(AsyncBroadcastChannel.history.slice(historyBefore).filter((entry) => messageType(entry.data) === "COMMAND")).toHaveLength(0);
    expect(lastMessage("HELLO")).toMatchObject({ version: 1 });
    expect(states).toEqual([]);

    client.dispose();
  });

  it("keeps an unknown command blocked when reconciliation has no owner response", async () => {
    vi.useFakeTimers();
    const harness = createHarness({ ownerInitiallyConnected: true });
    AsyncBroadcastChannel.dropNext = (data) => messageType(data) === "ACK";
    const pending = harness.client.send({ type: "PLAY", item: item("lost-reconcile") });
    const pendingOutcome = pending.then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    await settleMessages();
    await vi.advanceTimersByTimeAsync(5000);
    const pendingSettled = await pendingOutcome;
    expect(pendingSettled.ok).toBe(false);
    if (pendingSettled.ok) throw new Error("expected the command to become unknown");
    expect((pendingSettled.error as Error).message).toMatch(/ยืนยันผล|unknown/i);

    harness.owner.dispose();
    harness.open.mockResolvedValueOnce(false);
    harness.client.reconcile();
    await settleMessages();
    expect(last(harness.states)?.error).toContain("เปิดเครื่องเล่นไม่ได้");
    await expect(harness.client.send({ type: "PLAY_NEXT", item: item("open-failed") })).rejects.toThrow(/ยืนยันผล|reconcile/i);

    harness.client.reconcile();
    await settleMessages();
    await vi.advanceTimersByTimeAsync(5000);

    expect(last(harness.states)?.error).toMatch(/ยืนยันผล|ตรวจสถานะ|unknown/i);
    await expect(harness.client.send({ type: "PLAY_NEXT", item: item("still-unknown") })).rejects.toThrow(/ยืนยันผล|reconcile/i);
    disposeHarness(harness);
  });

  it("closes the owner channel when initial READY setup throws", () => {
    class ThrowingChannel {
      static instances: ThrowingChannel[] = [];
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      closed = false;

      constructor(_name: string) {
        ThrowingChannel.instances.push(this);
      }

      postMessage(_data: unknown): void {
        throw new Error("ready setup failed");
      }

      close(): void {
        this.closed = true;
      }
    }

    vi.stubGlobal("BroadcastChannel", ThrowingChannel);
    const owner = createPlaybackOwner({
      getSnapshot: () => snapshot(null),
      execute: () => undefined,
    });

    expect(() => owner.connect()).toThrow("ready setup failed");
    expect(ThrowingChannel.instances).toHaveLength(1);
    expect(ThrowingChannel.instances[0].closed).toBe(true);
  });

  it("retains owner session deduplication across connect cleanup and remount", async () => {
    const harness = createHarness({ ownerInitiallyConnected: true });
    const command = { type: "PLAY", item: item("strict") } as const;
    await expect(harness.client.send(command)).resolves.toBeUndefined();
    const firstWireCommand = clone(lastMessage("COMMAND"));

    const disconnect = harness.owner.connect();
    disconnect();
    harness.owner.connect();
    await postRaw(firstWireCommand);

    expect(harness.executeCalls).toEqual([command]);
    disposeHarness(harness);
  });

  it("ignores malformed, wrong-version, wrong-session, and wrong-target replies", async () => {
    const harness = createHarness({ ownerInitiallyConnected: true });
    const command = { type: "PLAY", item: item("valid") } as const;
    await expect(harness.client.send(command)).resolves.toBeUndefined();
    const ready = lastMessage("READY");
    const ack = lastMessage("ACK");
    const before = harness.states.length;

    await postRaw({ type: "READY", version: 2, owner: ready.owner, snapshot: ready.snapshot });
    await postRaw({ type: "STATE", version: 1, owner: "other-owner", snapshot: snapshot(item("bad"), "playing") });
    await postRaw({ type: "STATE", version: 1, owner: ready.owner, snapshot: { item: "bad", state: "playing" } });
    await postRaw({ type: "STATE", version: 1, owner: ready.owner, snapshot: { item: null, state: ["playing"] } });
    await postRaw({ type: "ACK", version: 1, owner: ready.owner, target: "other-client", id: ack.id, snapshot: ack.snapshot });
    await postRaw({ type: "ACK", version: 1, owner: ready.owner, target: ack.target, id: ack.id, snapshot: { item: null, state: "unknown" } });
    await postRaw(null);

    expect(harness.states.length).toBe(before);
    await postRaw({
      type: "COMMAND",
      version: 1,
      owner: ready.owner,
      client: ack.target,
      id: "array-command",
      command: { type: ["PLAY"], item: item("bad-array") },
    });
    expect(harness.executeCalls).toEqual([command]);
    disposeHarness(harness);
  });

  it("reports a known owner execution failure separately from an unknown timeout", async () => {
    const known = createHarness({
      ownerInitiallyConnected: true,
      execute: () => { throw new Error("decoder failed"); },
    });
    const knownResult = known.client.send({ type: "PLAY", item: item("known-failure") });
    await expect(knownResult).rejects.toThrow("decoder failed");
    expect(last(known.states)?.error).toContain("decoder failed");
    disposeHarness(known);

    vi.useFakeTimers();
    const unknown = createHarness({ ownerInitiallyConnected: true });
    AsyncBroadcastChannel.dropNext = (data) => messageType(data) === "ACK";
    const unknownResult = unknown.client.send({ type: "PLAY", item: item("unknown") });
    const unknownOutcome = unknownResult.then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    await settleMessages();
    await vi.advanceTimersByTimeAsync(5000);
    const unknownSettled = await unknownOutcome;
    expect(unknownSettled.ok).toBe(false);
    if (unknownSettled.ok) throw new Error("expected the command to become unknown");
    expect(unknownSettled.error).toBeInstanceOf(Error);
    expect((unknownSettled.error as Error).message).toMatch(/ยืนยันผล|unknown/i);
    expect(last(unknown.states)?.error).toMatch(/ยืนยันผล|unknown/i);

    const blocked = unknown.client.send({ type: "PLAY_NEXT", item: item("blocked") });
    await expect(blocked).rejects.toThrow(/ยืนยันผล|reconcile/i);
    unknown.client.reconcile();
    await settleMessages();
    await expect(unknown.client.send({ type: "PLAY_NEXT", item: item("after-reconcile") })).resolves.toBeUndefined();
    expect(unknown.executeCalls.map((entry) => entry.type)).toEqual(["PLAY", "PLAY_NEXT"]);
    disposeHarness(unknown);
  });

  it("does not replay an unknown command into a reloaded owner session", async () => {
    vi.useFakeTimers();
    const first = createHarness({ ownerInitiallyConnected: true });
    AsyncBroadcastChannel.dropNext = (data) => messageType(data) === "ACK";
    const prior = first.client.send({ type: "PLAY", item: item("reload") });
    const priorOutcome = prior.then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    await settleMessages();
    await vi.advanceTimersByTimeAsync(5000);
    const priorSettled = await priorOutcome;
    expect(priorSettled.ok).toBe(false);
    if (priorSettled.ok) throw new Error("expected the reloaded command to become unknown");
    expect((priorSettled.error as Error).message).toMatch(/ยืนยันผล|unknown/i);
    expect(first.executeCalls).toHaveLength(1);

    first.owner.dispose();
    const reloadedCalls: PlaybackCommand[] = [];
    const reloaded = createPlaybackOwner({
      getSnapshot: () => snapshot(null),
      execute: (command) => { reloadedCalls.push(command); },
    });
    reloaded.connect();
    first.client.reconcile();
    await settleMessages();

    expect(reloadedCalls).toEqual([]);
    expect(last(first.states)?.error).toMatch(/ไม่พบผล|เริ่มใหม่|unknown/i);
    await expect(first.client.send({ type: "PLAY_NEXT", item: item("new-action") })).resolves.toBeUndefined();
    expect(reloadedCalls).toEqual([{ type: "PLAY_NEXT", item: item("new-action") }]);

    first.client.dispose();
    reloaded.dispose();
  });

  it("propagates owner snapshots through READY and later STATE publications", async () => {
    let current = snapshot(item("state-a"), "paused");
    const owner = createPlaybackOwner({
      getSnapshot: () => current,
      execute: () => undefined,
    });
    owner.connect();
    const states: PlaybackClientState[] = [];
    const client = createPlaybackClient({
      open: async () => true,
      onState: (next) => states.push(next),
    });
    client.connect();
    await settleMessages();
    expect(last(states)?.nowPlaying).toEqual(current);

    current = snapshot(item("state-b"), "playing");
    owner.publish();
    await settleMessages();
    expect(last(states)?.nowPlaying).toEqual(current);

    client.dispose();
    owner.dispose();
  });

  it("surfaces popup failure and unavailable transport without claiming success", async () => {
    const popupFailure = createHarness({ openResult: false });
    const popupResult = popupFailure.client.send({ type: "PLAY", item: item("popup") });
    await expect(popupResult).rejects.toThrow(/เปิดเครื่องเล่นไม่ได้/);
    expect(last(popupFailure.states)?.pending).toBe(false);
    expect(last(popupFailure.states)?.error).toContain("เปิดเครื่องเล่นไม่ได้");
    expect(popupFailure.executeCalls).toEqual([]);
    disposeHarness(popupFailure);

    vi.stubGlobal("BroadcastChannel", undefined);
    const states: PlaybackClientState[] = [];
    const unavailable = createPlaybackClient({
      open: async () => true,
      onState: (next) => states.push(next),
    });
    expect(() => unavailable.connect()).not.toThrow();
    await expect(unavailable.send({ type: "PLAY", item: item("transport") })).rejects.toThrow(/เชื่อมต่อเครื่องเล่น/);
    expect(last(states)?.pending).toBe(false);
    expect(last(states)?.error).toBeTruthy();
    unavailable.dispose();
  });
});
