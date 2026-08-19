// @req FR-10 — schema versioning + migration ของ project snapshot
/**
 * migrate.ts — ยกระดับ snapshot เก่าให้เป็นโครงสร้างปัจจุบัน
 *
 * ทางเข้าเดียวสำหรับทั้ง Open (จาก /projects) และกู้ draft (จาก localStorage)
 * เพิ่มขั้นใหม่ทุกครั้งที่โครงสร้าง snapshot เปลี่ยน แล้วบวก SCHEMA_VERSION ทีละ 1
 *
 * v1 (ไม่มี schemaVersion) = ก่อนย้าย pan/tempo/loop/stemGains เข้า model
 * v2                       = pan อยู่ที่ Track, timeSig/loop อยู่ที่ Project, stemGains อยู่ใน snapshot
 */

/** เวอร์ชันปัจจุบันของ snapshot */
export const SCHEMA_VERSION = 2;

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
      tracks: tracks.map((t) => ({ ...t, pan: typeof t.pan === "number" ? t.pan : 0 })),
    };
    out.stemGains = (raw.stemGains as Dict | undefined) ?? { ...DEFAULT_STEM_GAINS };
  }

  out.schemaVersion = 2;
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

  snap.schemaVersion = SCHEMA_VERSION;
  return snap;
}
