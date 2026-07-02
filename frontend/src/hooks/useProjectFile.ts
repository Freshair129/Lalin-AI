import { useCallback, useEffect, useRef, useState } from "react";
import { projects, type ProjectMeta } from "../api";

/**
 * useProjectFile — ระบบ project แบบ Adobe (New / Open / Save / Save As / Close)
 *  - currentId: null = ยังไม่เคยบันทึก (Untitled), มี id = บันทึกอยู่บน server
 *  - dirty: true เมื่อ snapshot ปัจจุบัน ≠ snapshot ที่บันทึกล่าสุด
 *  - Save: ถ้ามี id → PUT ทับ, ถ้าไม่มี → ถามชื่อ + POST สร้าง
 *  - Save As: ถามชื่อใหม่ + POST สร้าง id ใหม่
 *  - beforeunload: เตือนถ้ามี dirty
 */
export function useProjectFile<T extends Record<string, unknown>>({
  buildSnapshot,
  applySnapshot,
}: {
  buildSnapshot: () => T;             // เก็บสถานะปัจจุบันเป็นวัตถุ
  applySnapshot: (snap: T) => void;   // คืนสถานะจากวัตถุ (ใช้ตอน Open)
}) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentName, setCurrentName] = useState<string>("Untitled");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [list, setList] = useState<ProjectMeta[] | null>(null);

  // snapshot ที่อ้างอิงเพื่อตรวจ dirty (JSON ของ data ล่าสุดที่บันทึก/โหลด)
  const baselineRef = useRef<string | null>(null);
  // กัน applySnapshot ทริก dirty ระหว่าง Open
  const loadingRef = useRef(false);
  // หยุดวงรอบ effect ตอนยังโหลด snapshot ไม่ขึ้น
  const readyRef = useRef(false);
  useEffect(() => { readyRef.current = true; }, []);

  // คำนวณ dirty: เทียบ snapshot ปัจจุบันกับ baseline
  // ใช้ JSON.stringify เพราะ snapshot เป็น plain object ของ recipe + project
  useEffect(() => {
    if (loadingRef.current) return;
    try {
      const snap = JSON.stringify(buildSnapshot());
      if (baselineRef.current === null) {
        // ยังไม่เคย baseline → ไฟล์ใหม่ที่ยังไม่ถูกแตะ
        baselineRef.current = snap;
        setDirty(false);
      } else {
        setDirty(snap !== baselineRef.current);
      }
    } catch { /* */ }
  });

  // เตือนเมื่อปิดแท็บโดยมี dirty
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const _baselineFromCurrent = () => { baselineRef.current = JSON.stringify(buildSnapshot()); setDirty(false); };

  // ── New: เริ่มไฟล์ใหม่ (ถามถ้ามี dirty) ──────────────────
  const newProject = useCallback(() => {
    if (dirty && !window.confirm("มีการเปลี่ยนแปลงที่ยังไม่บันทึก — ทิ้งแล้วเริ่มใหม่?")) return false;
    loadingRef.current = true;
    applySnapshot({} as T); // ส่ง object ว่าง → applySnapshot จัดค่า default เอง
    setCurrentId(null);
    setCurrentName("Untitled");
    baselineRef.current = null; // ให้รอบ effect ถัดไป baseline ใหม่
    setDirty(false);
    queueMicrotask(() => { loadingRef.current = false; });
    return true;
  }, [dirty, applySnapshot]);

  // ── Save: ทับไฟล์เดิม / สร้างใหม่ถ้ายังไม่มี id ─────────
  const save = useCallback(async () => {
    setSaving(true);
    try {
      const data = buildSnapshot();
      if (currentId) {
        await projects.update(currentId, currentName, data);
      } else {
        const name = window.prompt("ตั้งชื่อโปรเจกต์", currentName === "Untitled" ? "audio-01" : currentName);
        if (!name) return false;
        const r = await projects.save(name, data);
        setCurrentId(r.id); setCurrentName(r.name);
      }
      _baselineFromCurrent();
      setLastSavedAt(Date.now());
      return true;
    } finally { setSaving(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, currentName, buildSnapshot]);

  // ── Save As: สร้าง id ใหม่เสมอ ─────────────────────────
  const saveAs = useCallback(async () => {
    const name = window.prompt("บันทึกเป็น (ชื่อใหม่)", currentName === "Untitled" ? "audio-01" : `${currentName} copy`);
    if (!name) return false;
    setSaving(true);
    try {
      const r = await projects.save(name, buildSnapshot());
      setCurrentId(r.id); setCurrentName(r.name);
      _baselineFromCurrent();
      setLastSavedAt(Date.now());
      return true;
    } finally { setSaving(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentName, buildSnapshot]);

  // ── Open dialog: ดึง list ─────────────────────────────
  const openDialog = useCallback(async () => {
    const r = await projects.list();
    setList(r.projects);
  }, []);
  const closeDialog = useCallback(() => setList(null), []);

  // ── Open project ─────────────────────────────────────
  const openProject = useCallback(async (id: string) => {
    if (dirty && !window.confirm("มีการเปลี่ยนแปลงที่ยังไม่บันทึก — ทิ้งแล้วเปิดไฟล์อื่น?")) return false;
    const r = await projects.get(id);
    loadingRef.current = true;
    applySnapshot(r.data as T);
    setCurrentId(r.id); setCurrentName(r.name);
    setList(null);
    // baseline หลัง applySnapshot ค่อย flush
    baselineRef.current = null;
    setDirty(false);
    queueMicrotask(() => { loadingRef.current = false; });
    return true;
  }, [dirty, applySnapshot]);

  // ── Rename: แก้ชื่อ + Save ทับ (ถ้ามี id) หรือแค่ตั้งชื่อ ──
  const rename = useCallback(async (name: string) => {
    if (!name.trim()) return;
    setCurrentName(name);
    if (currentId) {
      setSaving(true);
      try { await projects.update(currentId, name, buildSnapshot()); _baselineFromCurrent(); setLastSavedAt(Date.now()); }
      finally { setSaving(false); }
    } else {
      // untitled → แค่ปรับชื่อในใจ ยังไม่บันทึก (จะถาม Save แล้วใช้ชื่อนี้)
      setDirty(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, buildSnapshot]);

  // ── Delete project (จาก dialog) ──────────────────────
  const removeProject = useCallback(async (id: string) => {
    if (!window.confirm("ลบโปรเจกต์นี้ถาวร?")) return false;
    await projects.remove(id);
    if (currentId === id) { setCurrentId(null); setCurrentName("Untitled"); baselineRef.current = null; setDirty(false); }
    const r = await projects.list();
    setList(r.projects);
    return true;
  }, [currentId]);

  return {
    currentId, currentName, dirty, saving, lastSavedAt, list,
    newProject, save, saveAs, openDialog, closeDialog, openProject, rename, removeProject,
  };
}
