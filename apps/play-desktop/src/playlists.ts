export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
}
const KEY = "lalin-play:v1:playlists";

export function loadPlaylists(): Playlist[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("playlists" in value) ||
    !Array.isArray(value.playlists)
  ) {
    throw new Error("รูปแบบ playlist ไม่รองรับ ข้อมูลเดิมยังไม่ถูกเขียนทับ");
  }
  if (value.playlists.length > 200)
    throw new Error("จำนวน playlist เกินขอบเขตที่รองรับ");
  for (const item of value.playlists) {
    if (
      !item ||
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 120 ||
      !Array.isArray(item.trackIds) ||
      item.trackIds.length > 10000 ||
      !item.trackIds.every((id: unknown) => typeof id === "string")
    ) {
      throw new Error("ข้อมูล playlist เสียหาย กรุณาเก็บสำรองก่อนแก้ไข");
    }
  }
  return value.playlists;
}

export function savePlaylists(playlists: Playlist[]) {
  localStorage.setItem(KEY, JSON.stringify({ version: 1, playlists }));
}
