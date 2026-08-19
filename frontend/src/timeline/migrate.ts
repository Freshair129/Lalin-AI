// @req FR-10 — schema versioning + migration ของ project snapshot
/**
 * migrate.ts — ยกระดับ snapshot เก่าให้เป็นโครงสร้างปัจจุบัน
 *
 * ทางเข้าเดียวสำหรับทั้ง Open (จาก /projects) และกู้ draft (จาก localStorage)
 * เพิ่มขั้นใหม่ทุกครั้งที่โครงสร้าง snapshot เปลี่ยน แล้วบวก SCHEMA_VERSION ทีละ 1
 *
 * v1 (ไม่มี schemaVersion) = ก่อนย้าย pan/tempo/loop/stemGains เข้า model
 * v2                       = pan อยู่ที่ Track, timeSig/loop อยู่ที่ Project, stemGains อยู่ใน snapshot
 * v3                       = clip.src (URL เต็ม ผูกกับเครื่อง) → clip.assetId + Project.assets
 */
import { addAsset } from "./assets";

/** เวอร์ชันปัจจุบันของ snapshot */
export const SCHEMA_VERSION = 3;

const DEFAULT_STEM_GAINS = { vocals: 1, drums: 1, bass: 1, other: 1 };

type Dict = Record<string, unknown>;

/** v1 → v2: เติมฟิลด์ที่เคยอยู่ใน useState ของ component ให้ครบใน model */
function v1ToV2(raw: Dict): Dict {
  const out: Dict = { ...raw };
  const project = raw.project as Dict | undefined;

  if (project) {
    const tracks = (project.tracks as Dict[] | undefined) ?? [];
    out.project = {
      ...project,
      timeSig: typeof project.timeSig === "number" ? project.timeSig : 4,
      loop: project.loop ?? null,
      assets: project.assets ?? {},
      tracks: tracks.map((t) => ({ ...t, pan: typeof t.pan === "number" ? t.pan : 0 })),
    };
    out.stemGains = (raw.stemGains as Dict | undefined) ?? { ...DEFAULT_STEM_GAINS };
  }

  out.schemaVersion = 2;
  return out;
}

/** "http://host/files/input/NAME" → {kind:"upload", name:"NAME"}; คืน null ถ้าไม่รู้จักรูปแบบ */
function parseLegacySrc(src: unknown): { kind: "upload" | "output"; name: string } | null {
  if (typeof src !== "string") return null;
  const m = src.match(/\/files\/(input|download)\/([^/?#]+)$/);
  if (!m) return null;
  return { kind: m[1] === "input" ? "upload" : "output", name: decodeURIComponent(m[2]) };
}

/** v2 → v3: แปลง clip.src (URL เต็ม ผูกกับ host/พอร์ตของเครื่องที่บันทึก) เป็น clip.assetId + Project.assets */
function v2ToV3(raw: Dict): Dict {
  const out: Dict = { ...raw };
  const project = raw.project as Dict | undefined;

  if (project) {
    let assets = (project.assets as Record<string, { id: string; kind: "upload" | "output"; name: string }>) ?? {};
    const tracks = ((project.tracks as Dict[] | undefined) ?? []).map((t) => ({
      ...t,
      clips: ((t.clips as Dict[] | undefined) ?? []).map((c) => {
        const { src, ...rest } = c;
        const parsed = parseLegacySrc(src);
        if (!parsed) return { ...rest, assetId: (c.assetId as string | null) ?? null };
        const added = addAsset(assets, parsed.kind, parsed.name);
        assets = added.assets;
        return { ...rest, assetId: added.id };
      }),
    }));
    out.project = { ...project, assets, tracks };
  }

  out.schemaVersion = 3;
  return out;
}

/**
 * ยกระดับ snapshot ให้เป็นเวอร์ชันปัจจุบัน — ไม่แก้ input (คืนวัตถุใหม่เสมอ)
 * รับ input พังๆ ได้ (null/undefined/สตริง) เพื่อไม่ให้ไฟล์เสียทำให้แอปล้ม
 */
export function migrateSnapshot(raw: unknown): Dict {
  let snap: Dict = raw && typeof raw === "object" ? { ...(raw as Dict) } : {};
  const version = typeof snap.schemaVersion === "number" ? snap.schemaVersion : 1;

  if (version < 2) snap = v1ToV2(snap);
  if (version < 3) snap = v2ToV3(snap);

  snap.schemaVersion = SCHEMA_VERSION;
  return snap;
}

// ── รูปร่างของ snapshot ที่บันทึกลง /projects ──────────────────────────────
// ประกาศเป็น type แล้วให้ buildSnapshot ใน RemixPanel annotate ด้วยตัวนี้
// → ถ้าเพิ่ม parameter ใหม่แล้วลืมใส่ใน snapshot จะเป็น compile error ไม่ใช่บั๊กเงียบ
export interface ProjectSnapshot {
  schemaVersion: number;

  // recipe ที่ส่งให้ /music/remix
  source: string | null;
  beat: string | null;
  autotune: boolean;
  fx: boolean;
  reverb: number;
  delay: number;
  offsetAuto: boolean;
  offsetMs: number;
  lufs: number;
  stemGains: Record<string, number>;

  // master FX (preview + bake)
  mReverb: number;
  mEcho: number;
  mComp: boolean;

  // ขนาด panel ที่ผู้ใช้ลากไว้
  leftW: number;
  tlH: number;
  rackH: number;

  // arrangement ทั้งหมด
  project: unknown;
}
