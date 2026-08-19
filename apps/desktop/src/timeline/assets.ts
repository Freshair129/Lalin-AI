// @req FR-10 — asset table: อ้างอิงไฟล์แบบพกพาได้ (ไม่ผูกกับ host/พอร์ต)
/**
 * assets.ts — จุดเดียวในแอปที่ประกอบ API_BASE เข้ากับชื่อไฟล์
 *
 * ก่อนหน้านี้ clip เก็บ URL เต็ม (http://127.0.0.1:8756/files/input/song.mp3)
 * ซึ่งผูกกับ host/พอร์ตของเครื่องที่บันทึกไว้ — เปิดโปรเจกต์บนเครื่องอื่นแล้ว
 * URL จะชี้กลับมาที่ backend ของเครื่องใหม่ (ไม่ใช่เครื่องที่มีไฟล์)
 *
 * แก้โดยเก็บแค่ (kind, name) ใน Project.assets แล้ว resolve เป็น URL ตอนใช้จริง
 */
import { API_BASE } from "../api";
import type { Project } from "./clipModel";

export type AssetKind = "upload" | "output";

export interface AssetRef {
  id: string;
  kind: AssetKind;
  name: string;   // ชื่อไฟล์ใน uploads/ หรือ outputs/ (ไม่ใช่ path เต็ม ไม่ใช่ URL)
}

/** djb2 — hash สั้น ๆ ที่ deterministic ข้ามเครื่อง (ไม่ใช้ crypto เพราะต้อง sync) */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** id เดิมเสมอสำหรับไฟล์เดิม → เพิ่มไฟล์ซ้ำไม่สร้าง asset ซ้ำ */
export function assetId(kind: AssetKind, name: string): string {
  return `a_${djb2(`${kind}:${name}`)}`;
}

export function addAsset(
  assets: Record<string, AssetRef>,
  kind: AssetKind,
  name: string,
): { assets: Record<string, AssetRef>; id: string } {
  const id = assetId(kind, name);
  if (assets[id]) return { assets, id };
  return { assets: { ...assets, [id]: { id, kind, name } }, id };
}

/** จุดเดียวในแอปที่ประกอบ API_BASE เข้ากับ asset — ที่อื่นห้ามเก็บ URL เต็ม */
export function resolveAssetUrl(project: Project, id: string | null): string | null {
  if (!id) return null;
  const ref = project.assets?.[id];
  if (!ref) return null;
  const path = ref.kind === "upload" ? "input" : "download";
  return `${API_BASE}/files/${path}/${encodeURIComponent(ref.name)}`;
}
