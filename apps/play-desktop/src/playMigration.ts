import { invoke } from "@tauri-apps/api/core";
import {
  EQ_FREQUENCIES,
  type PlaybackEQ,
  type PlaybackQueue,
} from "./contracts";
import { mediaItem, type LocalTrack } from "./native";

export const PLAY_MIGRATION_MAX_BYTES = 16 * 1024 * 1024;
export const PLAY_QUEUE_KEY = "lalin-play:v1:queue";
export const PLAY_EQ_KEY = "lalin-play:v1:eq";
export const PLAY_RESUME_KEY = "lalin-play:v1:resume";

export interface MigrationEnvelope {
  format: "lalin-play-migration";
  schemaVersion: 1;
  exportId: string;
  createdAt: string;
  sourceApp: "lalin-studio";
  sourceVersion: string;
  sourceCommit: string | null;
  queue: {
    items: Array<{
      entryId: string;
      localPath: string;
      title?: string;
      kind?: "audio" | "video";
    }>;
    currentEntryId: string | null;
    repeatMode: "off" | "one" | "all";
    shuffle: boolean;
  };
  eq: {
    enabled: boolean;
    preamp: number;
    bands: Array<{ frequency: number; gain: number }>;
    currentPreset: string;
    customPresets: Array<{ name: string; preamp: number; gains: number[] }>;
  };
  unresolved: Array<{ entryId: string; displayLabel: string; reason: string }>;
}

export interface MigrationQueuePlan {
  items: Array<{ entryId: string; track: LocalTrack }>;
  currentEntryId: string | null;
  repeatMode: "off" | "one" | "all";
  shuffle: boolean;
}

export interface MigrationPreview {
  exportId: string;
  plan: MigrationQueuePlan;
  eq: MigrationEnvelope["eq"];
  unresolved: MigrationEnvelope["unresolved"];
  alreadyImported: boolean;
  transactionId?: string;
}

export interface MigrationRecovery {
  transactionId: string;
  committed: boolean;
  oldQueueRaw: string | null;
  oldEqRaw: string | null;
  oldResumeRaw: string | null;
  plan: MigrationQueuePlan;
  eq: MigrationEnvelope["eq"];
}

export function parseMigrationEnvelope(raw: string): MigrationEnvelope {
  if (new TextEncoder().encode(raw).byteLength > PLAY_MIGRATION_MAX_BYTES) {
    throw new Error("ไฟล์ migration มีขนาดเกิน 16 MiB");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("ไฟล์ migration ไม่ใช่ JSON ที่ถูกต้อง");
  }
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "format", "schemaVersion", "exportId", "createdAt", "sourceApp",
    "sourceVersion", "sourceCommit", "queue", "eq", "unresolved",
  ]) || !hasRequiredKeys(value, [
    "format", "schemaVersion", "exportId", "createdAt", "sourceApp",
    "sourceVersion", "sourceCommit", "queue", "eq", "unresolved",
  ])) throw new Error("รูปแบบ migration ไม่รองรับ");
  if (
    value.format !== "lalin-play-migration" || value.schemaVersion !== 1 ||
    !isUuid(value.exportId) || !isIsoUtcTimestamp(value.createdAt) ||
    value.sourceApp !== "lalin-studio" || !boundedText(value.sourceVersion, 128) ||
    !(value.sourceCommit === null || boundedText(value.sourceCommit, 128))
  ) throw new Error("ข้อมูลหัวไฟล์ migration ไม่ถูกต้องหรือไม่รองรับ");

  const queue = parseQueue(value.queue);
  const eq = parseEq(value.eq);
  if (!Array.isArray(value.unresolved) || value.unresolved.length > 10_000) {
    throw new Error("รายการที่แก้ไขไม่ได้เกินขอบเขตที่รองรับ");
  }
  const unresolved = value.unresolved.map(parseUnresolved);
  const ids = new Set<string>();
  for (const entry of [...queue.items, ...unresolved]) {
    if (ids.has(entry.entryId)) throw new Error("พบ entryId ซ้ำในไฟล์ migration");
    ids.add(entry.entryId);
  }
  if (queue.items.length + unresolved.length > 10_000) {
    throw new Error("จำนวนรายการรวมเกิน 10,000 รายการ");
  }
  if (queue.currentEntryId !== null && !ids.has(queue.currentEntryId)) {
    throw new Error("รายการที่เลือกปัจจุบันไม่มีอยู่ในคิวหรือรายการ unresolved");
  }

  return {
    format: "lalin-play-migration",
    schemaVersion: 1,
    exportId: value.exportId,
    createdAt: value.createdAt,
    sourceApp: "lalin-studio",
    sourceVersion: value.sourceVersion,
    sourceCommit: value.sourceCommit,
    queue,
    eq,
    unresolved,
  };
}

export function playbackQueueFromPlan(plan: MigrationQueuePlan): PlaybackQueue {
  const items = plan.items.map(({ track }) => mediaItem(track));
  return {
    items,
    currentIndex: plan.currentEntryId === null
      ? -1
      : plan.items.findIndex(({ entryId }) => entryId === plan.currentEntryId),
    repeatMode: plan.repeatMode,
    shuffle: plan.shuffle,
  };
}

export function playbackEqFromMigration(eq: MigrationEnvelope["eq"]): PlaybackEQ {
  return {
    enabled: eq.enabled,
    preamp: eq.preamp,
    bands: eq.bands.map(({ frequency, gain }) => ({ frequency, gain })),
    currentPreset: eq.currentPreset,
    customPresets: Object.fromEntries(
      eq.customPresets.map((preset) => [preset.name, {
        name: preset.name,
        preamp: preset.preamp,
        gains: [...preset.gains],
      }]),
    ),
  };
}

export async function previewPlayMigration(rawJson: string): Promise<MigrationPreview> {
  parseMigrationEnvelope(rawJson);
  return invoke<MigrationPreview>("preview_play_migration", { rawJson });
}

export async function recoverPlayMigrationBeforeStore(): Promise<void> {
  if (!isTauriRuntime()) return;
  const recovery = await invoke<MigrationRecovery | null>("recover_play_migration");
  if (!recovery) return;
  if (recovery.committed) {
    localStorage.setItem(
      PLAY_QUEUE_KEY,
      JSON.stringify(playbackQueueFromPlan(recovery.plan)),
    );
    localStorage.setItem(
      PLAY_EQ_KEY,
      JSON.stringify(playbackEqFromMigration(recovery.eq)),
    );
    localStorage.setItem(PLAY_RESUME_KEY, "true");
  } else {
    restoreOldStorage(recovery);
  }
  await invoke("ack_play_migration", { transactionId: recovery.transactionId });
}

function parseQueue(value: unknown): MigrationEnvelope["queue"] {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "items", "currentEntryId", "repeatMode", "shuffle",
  ]) || !hasRequiredKeys(value, ["items", "currentEntryId", "repeatMode", "shuffle"]) ||
      !Array.isArray(value.items) || value.items.length > 10_000 ||
      !(value.currentEntryId === null || isUuid(value.currentEntryId)) ||
      !(value.repeatMode === "off" || value.repeatMode === "one" || value.repeatMode === "all") ||
      typeof value.shuffle !== "boolean") {
    throw new Error("ข้อมูล queue ใน migration ไม่ถูกต้อง");
  }
  const items = value.items.map((entry: unknown) => {
    if (!isRecord(entry) || !hasOnlyKeys(entry, ["entryId", "localPath", "title", "kind"]) ||
        !hasRequiredKeys(entry, ["entryId", "localPath"]) ||
        !isUuid(entry.entryId) || !isLocalSupportedPath(entry.localPath) ||
        !(entry.title === undefined || boundedText(entry.title, 512)) ||
        !(entry.kind === undefined || entry.kind === "audio" || entry.kind === "video")) {
      throw new Error("มีรายการ queue ที่ไม่ถูกต้องใน migration");
    }
    const pathKind = /\.(mp4|webm)$/i.test(entry.localPath) ? "video" : "audio";
    if (entry.kind !== undefined && entry.kind !== pathKind) {
      throw new Error("ชนิดสื่อไม่ตรงกับนามสกุลไฟล์");
    }
    return {
      entryId: entry.entryId,
      localPath: entry.localPath,
      ...(entry.title === undefined ? {} : { title: entry.title }),
      ...(entry.kind === undefined ? {} : { kind: entry.kind }),
    };
  });
  return {
    items,
    currentEntryId: value.currentEntryId,
    repeatMode: value.repeatMode,
    shuffle: value.shuffle,
  };
}

function parseEq(value: unknown): MigrationEnvelope["eq"] {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "enabled", "preamp", "bands", "currentPreset", "customPresets",
  ]) || !hasRequiredKeys(value, ["enabled", "preamp", "bands", "currentPreset", "customPresets"]) ||
      typeof value.enabled !== "boolean" || !validGain(value.preamp) ||
      !Array.isArray(value.bands) || value.bands.length !== EQ_FREQUENCIES.length ||
      !boundedText(value.currentPreset, 120) || !Array.isArray(value.customPresets) ||
      value.customPresets.length > 100) {
    throw new Error("ข้อมูล EQ ใน migration ไม่ถูกต้อง");
  }
  const bands = value.bands.map((band: unknown, index: number) => {
    if (!isRecord(band) || !hasOnlyKeys(band, ["frequency", "gain"]) ||
        !hasRequiredKeys(band, ["frequency", "gain"]) ||
        band.frequency !== EQ_FREQUENCIES[index] || !validGain(band.gain)) {
      throw new Error("จำนวน ลำดับ หรือค่า gain ของ EQ ไม่ถูกต้อง");
    }
    return { frequency: band.frequency, gain: band.gain };
  });
  const names = new Set<string>();
  const customPresets = value.customPresets.map((preset: unknown) => {
    if (!isRecord(preset) || !hasOnlyKeys(preset, ["name", "preamp", "gains"]) ||
        !hasRequiredKeys(preset, ["name", "preamp", "gains"]) ||
        !boundedText(preset.name, 120) || !preset.name.trim() ||
        names.has(preset.name) || !validGain(preset.preamp) ||
        !Array.isArray(preset.gains) || preset.gains.length !== EQ_FREQUENCIES.length ||
        !preset.gains.every(validGain)) {
      throw new Error("มี custom EQ preset ที่ไม่ถูกต้อง");
    }
    names.add(preset.name);
    return { name: preset.name, preamp: preset.preamp, gains: [...preset.gains] };
  });
  return {
    enabled: value.enabled,
    preamp: value.preamp,
    bands,
    currentPreset: value.currentPreset,
    customPresets,
  };
}

function parseUnresolved(value: unknown): MigrationEnvelope["unresolved"][number] {
  if (!isRecord(value) || !hasOnlyKeys(value, ["entryId", "displayLabel", "reason"]) ||
      !hasRequiredKeys(value, ["entryId", "displayLabel", "reason"]) ||
      !isUuid(value.entryId) || !boundedText(value.displayLabel, 512) ||
      !boundedText(value.reason, 256)) {
    throw new Error("รายการ unresolved ใน migration ไม่ถูกต้อง");
  }
  return {
    entryId: value.entryId,
    displayLabel: value.displayLabel,
    reason: value.reason,
  };
}

export function restoreOldStorage(recovery: MigrationRecovery): void {
  restoreKey(PLAY_QUEUE_KEY, recovery.oldQueueRaw);
  restoreKey(PLAY_EQ_KEY, recovery.oldEqRaw);
  restoreKey(PLAY_RESUME_KEY, recovery.oldResumeRaw);
}

function restoreKey(key: string, value: string | null): void {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" &&
    Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function hasRequiredKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function validGain(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -12 && value <= 12;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isIsoUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function isLocalSupportedPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 32_768 || value.includes("\0") ||
      value.startsWith("\\\\") || value.startsWith("//")) return false;
  const absolute = /^[a-zA-Z]:[\\/]/.test(value) || /^\/(?!\/)/.test(value);
  if (!absolute) return false;
  return /\.(mp3|wav|flac|ogg|opus|m4a|aac|aif|aiff|wma|mp4|webm)$/i.test(value);
}
