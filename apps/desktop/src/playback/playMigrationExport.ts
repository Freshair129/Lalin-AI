import {
  EQ_FREQUENCIES,
  type PlaybackEQ,
  type PlaybackQueue,
} from "@lalin/contracts";

declare const __APP_VERSION__: string;

const SUPPORTED_EXTENSIONS = new Set([
  "mp3", "wav", "flac", "ogg", "opus", "m4a", "aac", "aif", "aiff", "wma", "mp4", "webm",
]);

export interface PlayMigrationEntry {
  entryId: string;
  localPath: string;
  title?: string;
  kind?: "audio" | "video";
}

export interface PlayMigrationUnresolved {
  entryId: string;
  displayLabel: string;
  reason: string;
}

export interface PlayMigrationEQ {
  enabled: boolean;
  preamp: number;
  bands: Array<{ frequency: number; gain: number }>;
  currentPreset: string;
  customPresets: Array<{ name: string; preamp: number; gains: number[] }>;
}

export interface PlayMigrationEnvelope {
  format: "lalin-play-migration";
  schemaVersion: 1;
  exportId: string;
  createdAt: string;
  sourceApp: "lalin-studio";
  sourceVersion: string;
  sourceCommit: string | null;
  queue: {
    items: PlayMigrationEntry[];
    currentEntryId: string | null;
    repeatMode: "off" | "one" | "all";
    shuffle: boolean;
  };
  eq: PlayMigrationEQ;
  unresolved: PlayMigrationUnresolved[];
}

export function buildPlayMigrationEnvelope(
  queue: PlaybackQueue,
  eq: PlaybackEQ,
  identity: { exportId?: string; createdAt?: string; sourceVersion?: string } = {},
): PlayMigrationEnvelope {
  if (queue.items.length > 10_000) throw new Error("Queue exceeds the migration limit");
  if (eq.bands.length !== EQ_FREQUENCIES.length) throw new Error("Studio EQ data is invalid");
  for (let index = 0; index < EQ_FREQUENCIES.length; index += 1) {
    const band = eq.bands[index];
    if (
      band.frequency !== EQ_FREQUENCIES[index] ||
      !Number.isFinite(band.gain) || band.gain < -12 || band.gain > 12
    ) throw new Error("Studio EQ data is invalid");
  }
  if (!Number.isFinite(eq.preamp) || eq.preamp < -12 || eq.preamp > 12) {
    throw new Error("Studio EQ data is invalid");
  }

  const entryIds = queue.items.map(() => crypto.randomUUID());
  const items: PlayMigrationEntry[] = [];
  const unresolved: PlayMigrationUnresolved[] = [];
  queue.items.forEach((item, index) => {
    const entryId = entryIds[index];
    const label = item.title.trim().slice(0, 512) || `Queue item ${index + 1}`;
    const sourcePath = item.sourcePath;
    if (sourcePath && isSupportedAbsoluteLocalPath(sourcePath)) {
      const extension = sourcePath.split(/[./\\]/).pop()?.toLowerCase() ?? "";
      items.push({
        entryId,
        localPath: sourcePath,
        title: label,
        kind: extension === "mp4" || extension === "webm" ? "video" : "audio",
      });
    } else {
      unresolved.push({
        entryId,
        displayLabel: label,
        reason: "Studio did not provide a supported absolute local file path",
      });
    }
  });

  const customPresets = Object.entries(eq.customPresets).map(([key, preset]) => {
    const name = preset.name.trim();
    if (!name || name.length > 120 || key !== preset.name ||
        !Number.isFinite(preset.preamp) || preset.preamp < -12 || preset.preamp > 12 ||
        preset.gains.length !== EQ_FREQUENCIES.length ||
        preset.gains.some((gain) => !Number.isFinite(gain) || gain < -12 || gain > 12)) {
      throw new Error("Studio custom EQ preset data is invalid");
    }
    return { name, preamp: preset.preamp, gains: [...preset.gains] };
  });
  if (customPresets.length > 100) throw new Error("Too many custom EQ presets to export");

  const sourceVersion = identity.sourceVersion ??
    (typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown");
  const envelope: PlayMigrationEnvelope = {
    format: "lalin-play-migration",
    schemaVersion: 1,
    exportId: identity.exportId ?? crypto.randomUUID(),
    createdAt: identity.createdAt ?? new Date().toISOString(),
    sourceApp: "lalin-studio",
    sourceVersion: sourceVersion || "unknown",
    sourceCommit: null,
    queue: {
      items,
      currentEntryId:
        queue.currentIndex >= 0 && queue.currentIndex < entryIds.length
          ? entryIds[queue.currentIndex]
          : null,
      repeatMode: queue.repeatMode,
      shuffle: queue.shuffle,
    },
    eq: {
      enabled: eq.enabled,
      preamp: eq.preamp,
      bands: eq.bands.map(({ frequency, gain }) => ({ frequency, gain })),
      currentPreset: eq.currentPreset,
      customPresets,
    },
    unresolved,
  };
  serializePlayMigrationEnvelope(envelope);
  return envelope;
}

export function downloadPlayMigration(envelope: PlayMigrationEnvelope): void {
  const file = new Blob([serializePlayMigrationEnvelope(envelope)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `lalin-play-${envelope.exportId}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function serializePlayMigrationEnvelope(envelope: PlayMigrationEnvelope): string {
  const serialized = JSON.stringify(envelope, null, 2);
  if (new TextEncoder().encode(serialized).byteLength > 16 * 1024 * 1024) {
    throw new Error("Migration export exceeds the 16 MiB limit");
  }
  return serialized;
}

function isSupportedAbsoluteLocalPath(value: string): boolean {
  if (!value || value.length > 32_768 || value.includes("\0")) return false;
  if (value.startsWith("\\\\") || value.startsWith("//")) return false;
  const isAbsolute = /^[a-zA-Z]:[\\/]/.test(value) || /^\/(?!\/)/.test(value);
  if (!isAbsolute) return false;
  const extension = value.split(/[./\\]/).pop()?.toLowerCase() ?? "";
  return SUPPORTED_EXTENSIONS.has(extension);
}
