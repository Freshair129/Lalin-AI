// @req FR-16.1 FR-16.4 FR-16.6 FR-16.11 — ส่งคำสั่งให้ playback owner หลังพร้อมรับ
import type { MediaItem, NowPlaying } from "@lalin/contracts";

export type PlaybackCommand =
  | { type: "FOCUS_PLAYER" }
  | { type: "PLAY" | "PLAY_NEXT" | "ADD_TO_QUEUE"; item: MediaItem };
export type PlaybackSnapshot = Pick<NowPlaying, "item" | "state" | "error">;
export interface PlaybackClientState {
  nowPlaying: PlaybackSnapshot;
  error: string | null;
  pending: boolean;
}

const CHANNEL = "lalin:playback:bridge";
const TIMEOUT = 5000;
const idle = (): PlaybackSnapshot => ({ item: null, state: "idle" });
const sessionId = () => crypto.randomUUID();
type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;

function mediaItem(value: unknown): value is MediaItem {
  if (!record(value) || !text(value.id) || !text(value.url) || typeof value.title !== "string") return false;
  const strings = ["artist", "album", "sourcePath", "ext", "artworkUrl"];
  return strings.every((key) => value[key] === undefined || typeof value[key] === "string")
    && (value.duration === undefined || (typeof value.duration === "number" && Number.isFinite(value.duration) && value.duration >= 0))
    && (value.sourceKind === undefined || (typeof value.sourceKind === "string"
      && ["upload", "workspace", "output", "voice", "custom"].includes(value.sourceKind)));
}

function command(value: unknown): value is PlaybackCommand {
  return record(value) && (value.type === "FOCUS_PLAYER" ||
    (typeof value.type === "string" && ["PLAY", "PLAY_NEXT", "ADD_TO_QUEUE"].includes(value.type) && mediaItem(value.item)));
}

function snapshot(value: unknown): value is PlaybackSnapshot {
  return record(value) && (value.item === null || mediaItem(value.item))
    && typeof value.state === "string" && ["idle", "loading", "playing", "paused", "error"].includes(value.state)
    && (value.error === undefined || typeof value.error === "string");
}

function cloneSnapshot(value: PlaybackSnapshot): PlaybackSnapshot {
  if (typeof structuredClone === "function") return structuredClone(value);
  return {
    item: value.item ? { ...value.item } : null,
    state: value.state,
    ...(value.error === undefined ? {} : { error: value.error }),
  };
}

function message(value: unknown): value is RecordValue {
  return record(value) && value.version === 1 && text(value.type);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface PendingCommand {
  id: string;
  command: PlaybackCommand;
  opened: Promise<string | null>;
  resolve: () => void;
  reject: (error: Error) => void;
  stage: "opening" | "ready" | "ack";
}

interface PlaybackAcknowledgement {
  snapshot: PlaybackSnapshot;
  error?: string;
}

export function createPlaybackClient(options: {
  open: () => Promise<boolean>;
  onState: (state: PlaybackClientState) => void;
}) {
  const client = sessionId();
  let sequence = 0;
  let channel: BroadcastChannel | null = null;
  let owner: string | null = null;
  let active: PendingCommand | null = null;
  let uncertain: { id: string; owner: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reconcileTimer: ReturnType<typeof setTimeout> | undefined;
  let reconcileAttempt = 0;
  let reconcilePending = false;
  let reconcileHelloSent = false;
  let reconcileReady = false;
  const queue: PendingCommand[] = [];
  let state: PlaybackClientState = { nowPlaying: idle(), error: null, pending: false };
  const update = (patch: Partial<PlaybackClientState>) => {
    state = { ...state, ...patch };
    options.onState(state);
  };
  const clearTimer = () => { clearTimeout(timer); timer = undefined; };
  const clearReconcileTimer = () => { clearTimeout(reconcileTimer); reconcileTimer = undefined; };

  function finishReconcile() {
    reconcileAttempt += 1;
    reconcilePending = false;
    reconcileHelloSent = false;
    reconcileReady = false;
    clearReconcileTimer();
  }

  function reconcileFailure(reason: string) {
    finishReconcile();
    update({ error: reason, pending: Boolean(active || queue.length) });
  }

  function armReconcileTimer() {
    clearReconcileTimer();
    const attempt = ++reconcileAttempt;
    reconcilePending = true;
    reconcileHelloSent = false;
    reconcileReady = false;
    reconcileTimer = setTimeout(() => {
      if (attempt !== reconcileAttempt) return;
      reconcileTimer = undefined;
      reconcileAttempt += 1;
      reconcilePending = false;
      reconcileHelloSent = false;
      reconcileReady = false;
      update({
        error: uncertain
          ? "ยังยืนยันผลคำสั่งเดิมไม่ได้ กรุณาตรวจสถานะเครื่องเล่นก่อนสั่งใหม่"
          : "ตรวจสถานะเครื่องเล่นไม่สำเร็จ กรุณาลองอีกครั้ง",
        pending: Boolean(active || queue.length),
      });
    }, TIMEOUT);
    return attempt;
  }

  function fail(reason: string) {
    clearTimer();
    if (active?.stage === "ack" && owner) uncertain = { id: active.id, owner };
    const abandoned = active ? [active, ...queue.splice(0)] : queue.splice(0);
    active = null;
    update({ error: reason, pending: false });
    abandoned.forEach((task) => task.reject(new Error(reason)));
  }

  function post(payload: RecordValue) {
    if (!channel) throw new Error("ไม่สามารถเชื่อมต่อเครื่องเล่นได้");
    channel.postMessage({ ...payload, version: 1 });
  }

  function arm() {
    clearTimer();
    timer = setTimeout(() => fail(active?.stage === "ack"
      ? "ยังยืนยันผลคำสั่งไม่ได้ กรุณาตรวจสถานะเครื่องเล่นก่อนสั่งใหม่"
      : "เครื่องเล่นยังไม่พร้อม กรุณาลองเปิดอีกครั้ง"), TIMEOUT);
  }

  function receive(event: MessageEvent<unknown>) {
    const msg = event.data;
    if (!message(msg) || !text(msg.owner)) return;
    if (msg.type === "READY") {
      if ((msg.target !== undefined && msg.target !== client) || !snapshot(msg.snapshot)) return;
      if (uncertain) {
        if (msg.owner === uncertain.owner) {
          if (!reconcilePending) armReconcileTimer();
          post({ type: "QUERY", client, owner: msg.owner, id: uncertain.id });
        } else {
          uncertain = null;
          owner = msg.owner;
          if (reconcilePending) {
            reconcileReady = true;
            if (reconcileHelloSent) finishReconcile();
          }
          update({ nowPlaying: msg.snapshot, error: "เครื่องเล่นเริ่มใหม่ ผลคำสั่งเดิมไม่ทราบ กรุณาสั่งใหม่" });
        }
        return;
      }
      if (active?.stage === "ready") {
        owner = msg.owner;
        update({ nowPlaying: msg.snapshot, ...(reconcilePending ? { error: null } : {}) });
        active.stage = "ack";
        arm();
        post({ type: "COMMAND", client, owner, id: active.id, command: active.command });
      } else if (!active) {
        owner = msg.owner;
        update({ nowPlaying: msg.snapshot, ...(reconcilePending ? { error: null } : {}) });
      }
      if (reconcilePending) {
        reconcileReady = true;
        if (reconcileHelloSent) finishReconcile();
      }
      return;
    }
    if (msg.owner !== owner) return;
    if (msg.type === "STATE" && snapshot(msg.snapshot)) {
      update({ nowPlaying: msg.snapshot });
    } else if (msg.type === "UNKNOWN" && uncertain && text(msg.id) && msg.target === client && msg.id === uncertain.id) {
      uncertain = null;
      finishReconcile();
      update({ error: "ไม่พบผลคำสั่งเดิม กรุณาสั่งใหม่" });
    } else if (msg.type === "ACK" && msg.target === client && text(msg.id) && snapshot(msg.snapshot)
      && (msg.error === undefined || typeof msg.error === "string")) {
      if (uncertain?.id === msg.id) {
        uncertain = null;
        finishReconcile();
        update({ nowPlaying: msg.snapshot, error: typeof msg.error === "string" ? msg.error : null });
      } else if (active?.stage === "ack" && active.id === msg.id) {
        clearTimer();
        const done = active;
        active = null;
        update({ nowPlaying: msg.snapshot, pending: queue.length > 0, error: typeof msg.error === "string" ? msg.error : null });
        if (typeof msg.error === "string") {
          done.reject(new Error(msg.error));
          fail(msg.error);
        } else {
          done.resolve();
          void pump();
        }
      }
    }
  }

  function ensureChannel() {
    if (channel) return;
    if (typeof BroadcastChannel === "undefined") throw new Error("ระบบนี้ไม่รองรับการเชื่อมต่อเครื่องเล่นข้ามหน้าต่าง");
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => {
      try { receive(event); } catch (error) { fail(`เชื่อมต่อเครื่องเล่นไม่สำเร็จ: ${errorText(error)}`); }
    };
  }

  async function pump() {
    if (active || queue.length === 0) return;
    const task = queue.shift()!;
    active = task;
    arm();
    const openError = await task.opened;
    if (active !== task) return;
    if (openError) { fail(openError); return; }
    task.stage = "ready";
    arm();
    try { post({ type: "HELLO", client }); }
    catch (error) { fail(`ส่งคำสั่งไม่สำเร็จ: ${errorText(error)}`); }
  }

  function dispose() {
    if (active || queue.length) fail("การเชื่อมต่อเครื่องเล่นสิ้นสุด กรุณาตรวจสถานะก่อนสั่งใหม่");
    clearTimer();
    finishReconcile();
    channel?.close();
    channel = null;
  }

  return {
    connect() {
      try { ensureChannel(); post({ type: "HELLO", client }); }
      catch (error) { fail(errorText(error)); }
      return dispose;
    },
    send(value: PlaybackCommand): Promise<void> {
      if (!command(value)) return Promise.reject(new Error("คำสั่งเครื่องเล่นไม่ถูกต้อง"));
      if (uncertain) {
        update({ error: "ยังยืนยันผลคำสั่งเดิมไม่ได้ กรุณาตรวจสถานะเครื่องเล่น" });
        return Promise.reject(new Error(state.error!));
      }
      return new Promise((resolve, reject) => {
        try {
          ensureChannel();
          // เปิด popup ภายใน user gesture ก่อน await เพื่อไม่ให้ browser บล็อก
          const opened = options.open().then((ok) => ok ? null : "เปิดเครื่องเล่นไม่ได้ กรุณาอนุญาตหน้าต่างป๊อปอัป",
            (error: unknown) => `เปิดเครื่องเล่นไม่ได้: ${errorText(error)}`);
          queue.push({ id: `${client}:${++sequence}`, command: value, opened, resolve, reject, stage: "opening" });
          update({ pending: true, error: null });
          void pump();
        } catch (error) {
          const reason = `เปิดเครื่องเล่นไม่ได้: ${errorText(error)}`;
          fail(reason);
          reject(new Error(reason));
        }
      });
    },
    reconcile() {
      try {
        ensureChannel();
        // เปิด/โฟกัสภายใน user gesture ก่อนรอ Promise เพื่อให้ browser อนุญาต popup
        const opened = options.open();
        const attempt = armReconcileTimer();
        void Promise.resolve(opened).then((ok) => {
          if (attempt !== reconcileAttempt || !reconcilePending) return;
          if (!ok) {
            reconcileFailure("เปิดเครื่องเล่นไม่ได้ กรุณาอนุญาตหน้าต่างป๊อปอัป");
            return;
          }
          try {
            post({ type: "HELLO", client });
            reconcileHelloSent = true;
            if (reconcileReady) finishReconcile();
          }
          catch (error) { reconcileFailure(`ตรวจสถานะเครื่องเล่นไม่สำเร็จ: ${errorText(error)}`); }
        }, (error: unknown) => {
          if (attempt === reconcileAttempt) reconcileFailure(`เปิดเครื่องเล่นไม่ได้: ${errorText(error)}`);
        });
      } catch (error) {
        reconcileFailure(`ตรวจสถานะเครื่องเล่นไม่สำเร็จ: ${errorText(error)}`);
      }
    },
    dispose,
  };
}

export function createPlaybackOwner(options: {
  getSnapshot: () => PlaybackSnapshot;
  execute: (value: PlaybackCommand) => void | Promise<void>;
}) {
  const owner = sessionId();
  let channel: BroadcastChannel | null = null;
  let tail = Promise.resolve();
  // เก็บผลตลอดอายุ owner รวมถึง React effect cleanup/remount
  const handled = new Map<string, Promise<PlaybackAcknowledgement>>();
  function post(payload: RecordValue) {
    channel?.postMessage({ ...payload, version: 1, owner });
  }
  function ack(client: string, id: string, result: PlaybackAcknowledgement) {
    post({ type: "ACK", target: client, id, ...result });
  }
  function repeatAck(client: string, id: string, result: PlaybackAcknowledgement) {
    ack(client, id, result);
    // ACK คงเดิมตาม command ID แต่ STATE ต้องสะท้อนสถานะล่าสุดของ owner
    post({ type: "STATE", snapshot: options.getSnapshot() });
  }
  function receive(event: MessageEvent<unknown>) {
    const msg = event.data;
    if (!message(msg) || !text(msg.client)) return;
    if (msg.type === "HELLO") {
      post({ type: "READY", target: msg.client, snapshot: options.getSnapshot() });
      return;
    }
    if (msg.owner !== owner || !text(msg.id)) return;
    const client = msg.client;
    const id = msg.id;
    const key = JSON.stringify([client, id]);
    const existing = handled.get(key);
    if (msg.type === "QUERY") {
      if (existing) void existing.then((result) => repeatAck(client, id, result));
      else post({ type: "UNKNOWN", target: client, id });
    } else if (msg.type === "COMMAND" && command(msg.command)) {
      if (existing) { void existing.then((result) => repeatAck(client, id, result)); return; }
      const value = msg.command;
      const result = tail.then(async () => {
        try {
          await options.execute(value);
          return { snapshot: cloneSnapshot(options.getSnapshot()) };
        }
        catch (error) {
          return {
            snapshot: cloneSnapshot(options.getSnapshot()),
            error: `คำสั่งเครื่องเล่นล้มเหลว: ${errorText(error)}`,
          };
        }
      });
      handled.set(key, result);
      tail = result.then(() => {});
      void result.then((outcome) => ack(client, id, outcome));
    }
  }
  return {
    connect() {
      channel?.close();
      channel = null;
      const connected = new BroadcastChannel(CHANNEL);
      channel = connected;
      try {
        connected.onmessage = receive;
        post({ type: "READY", snapshot: options.getSnapshot() });
      } catch (error) {
        try { connected.close(); } finally {
          if (channel === connected) channel = null;
        }
        throw error;
      }
      return () => { connected.close(); if (channel === connected) channel = null; };
    },
    publish() { post({ type: "STATE", snapshot: options.getSnapshot() }); },
    dispose() { channel?.close(); channel = null; },
  };
}
