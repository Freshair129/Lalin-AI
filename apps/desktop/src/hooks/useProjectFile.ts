// @req FR-10 — project: New/Open/Save/Save As/Close (คู่กับ routers/projects.py)
import { useCallback, useEffect, useRef, useState } from "react";
import { projects, type ProjectMeta } from "../api";

/**
 * useProjectFile — ระบบ project แบบ Adobe (New / Open / Save / Save As / Close)
 *  - currentId: null = ยังไม่เคยบันทึก (Untitled), มี id = บันทึกอยู่บน server
 *  - dirty: true เมื่อ snapshot ปัจจุบัน ≠ snapshot ที่บันทึกล่าสุด
 *  - Save: ถ้ามี id → PUT ทับ, ถ้าไม่มี → ถามชื่อ + POST สร้าง
 *  - Save As: ถามชื่อใหม่ + POST สร้าง id ใหม่
 *  - beforeunload: เตือนถ้ามี dirty
 *  - autosave: ทุก 60s เมื่อ dirty เขียน draft ลง localStorage + กู้คืนได้ตอนเปิดแอปใหม่
 */
const AUTOSAVE_MS = 60_000;

type DraftPayload<T> = { name: string; data: T; savedAt: number };

function draftKey(id: string | null) {
  return `gmusic:draft:${id || "untitled"}`;
}

export function useProjectFile<T extends object>({
  buildSnapshot,
  applySnapshot,
  ui,
}: {
  buildSnapshot: () => T;                                  // เก็บสถานะปัจจุบัน (typed)
  // คืนสถานะจากวัตถุ — รับเป็น record ดิบเพราะมาจาก JSON บนดิสก์ ซึ่งอาจเป็น
  // snapshot เวอร์ชันเก่า; ตัว applySnapshot เป็นคนเรียก migrate เอง
  applySnapshot: (snap: Record<string, unknown>) => void;
  ui: {
    prompt: (message: string, defaultValue?: string) => Promise<string | null>;
    confirm: (message: string) => Promise<boolean>;
  };
}) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentName, setCurrentName] = useState<string>("Untitled");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [list, setList] = useState<ProjectMeta[] | null>(null);
  const [recoverable, setRecoverable] = useState<{ name: string; savedAt: number } | null>(null);

  // snapshot ที่อ้างอิงเพื่อตรวจ dirty (JSON ของ data ล่าสุดที่บันทึก/โหลด)
  const baselineRef = useRef<string | null>(null);
  // กัน applySnapshot ทริก dirty ระหว่าง Open
  const loadingRef = useRef(false);
  // หยุดวงรอบ effect ตอนยังโหลด snapshot ไม่ขึ้น
  const readyRef = useRef(false);
  useEffect(() => { readyRef.current = true; }, []);

  // ── ตรวจ draft ที่ค้างอยู่ตอน mount (กู้คืนได้ถ้าใหม่กว่า lastSavedAt) ──
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey(currentId));
      if (!raw) return;
      const draft = JSON.parse(raw) as DraftPayload<T>;
      if (!lastSavedAt || draft.savedAt > lastSavedAt) {
        setRecoverable({ name: draft.name, savedAt: draft.savedAt });
      }
    } catch { /* */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── autosave: ทุก 60s เมื่อ dirty เขียน draft ลง localStorage ──
  // เก็บค่าล่าสุดใน ref เพื่อไม่ให้ interval ถูก reset ทุกครั้งที่ state เปลี่ยน
  // (ถ้าใส่ buildSnapshot/dirty เป็น dep ตรง ๆ timer จะ restart ทุกการแก้ไข → ไม่ยิงสักที)
  const autosaveRef = useRef({ dirty, currentId, currentName, buildSnapshot });
  autosaveRef.current = { dirty, currentId, currentName, buildSnapshot };
  useEffect(() => {
    const t = window.setInterval(() => {
      const { dirty, currentId, currentName, buildSnapshot } = autosaveRef.current;
      if (!dirty || loadingRef.current) return;
      try {
        const payload: DraftPayload<T> = { name: currentName, data: buildSnapshot(), savedAt: Date.now() };
        window.localStorage.setItem(draftKey(currentId), JSON.stringify(payload));
      } catch { /* */ }
    }, AUTOSAVE_MS);
    return () => window.clearInterval(t);
  }, []);

  const _clearDraft = useCallback(() => {
    try { window.localStorage.removeItem(draftKey(currentId)); } catch { /* */ }
  }, [currentId]);

  const recoverDraft = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(draftKey(currentId));
      if (!raw) return;
      const draft = JSON.parse(raw) as DraftPayload<T>;
      loadingRef.current = true;
      // applySnapshot เรียก migrateSnapshot ให้แล้ว — draft เก่าจึงกู้คืนได้
      applySnapshot(draft.data as Record<string, unknown>);
      setCurrentName(draft.name);
      setDirty(true);
      setRecoverable(null);
      setTimeout(() => { loadingRef.current = false; }, 0);
    } catch { /* */ }
  }, [currentId, applySnapshot]);

  const discardDraft = useCallback(() => {
    _clearDraft();
    setRecoverable(null);
  }, [_clearDraft]);

  const _baselineFromCurrent = () => { baselineRef.current = JSON.stringify(buildSnapshot()); setDirty(false); };

  // ── New: เริ่มไฟล์ใหม่ (ถามถ้ามี dirty) ──────────────────
  const newProject = useCallback(async () => {
    if (dirty && !(await ui.confirm("มีการเปลี่ยนแปลงที่ยังไม่บันทึก — ทิ้งแล้วเริ่มใหม่?"))) return false;
    loadingRef.current = true;
    applySnapshot({}); // ส่ง object ว่าง → applySnapshot จัดค่า default เอง
    setCurrentId(null);
    setCurrentName("Untitled");
    baselineRef.current = null; // ให้รอบ effect ถัดไป baseline ใหม่
    setDirty(false);
    queueMicrotask(() => { loadingRef.current = false; });
    return true;
  }, [dirty, applySnapshot, ui]);

  // ── Save: ทับไฟล์เดิม / สร้างใหม่ถ้ายังไม่มี id ─────────
  const save = useCallback(async () => {
    setSaving(true);
    try {
      const data = buildSnapshot();
      if (currentId) {
        await projects.update(currentId, currentName, data as Record<string, unknown>);
      } else {
        const name = await ui.prompt("ตั้งชื่อโปรเจกต์", currentName === "Untitled" ? "audio-01" : currentName);
        if (!name) return false;
        const r = await projects.save(name, data as Record<string, unknown>);
        setCurrentId(r.id); setCurrentName(r.name);
      }
      _baselineFromCurrent();
      setLastSavedAt(Date.now());
      _clearDraft();
      return true;
    } finally { setSaving(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, currentName, buildSnapshot, ui, _clearDraft]);

  // ── Save As: สร้าง id ใหม่เสมอ ─────────────────────────
  const saveAs = useCallback(async () => {
    const name = await ui.prompt("บันทึกเป็น (ชื่อใหม่)", currentName === "Untitled" ? "audio-01" : `${currentName} copy`);
    if (!name) return false;
    setSaving(true);
    try {
      const r = await projects.save(name, buildSnapshot() as Record<string, unknown>);
      setCurrentId(r.id); setCurrentName(r.name);
      _baselineFromCurrent();
      setLastSavedAt(Date.now());
      _clearDraft();
      return true;
    } finally { setSaving(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentName, buildSnapshot, ui, _clearDraft]);

  // ── Open dialog: ดึง list ─────────────────────────────
  const openDialog = useCallback(async () => {
    const r = await projects.list();
    setList(r.projects);
  }, []);
  const closeDialog = useCallback(() => setList(null), []);

  // ── Open project ─────────────────────────────────────
  const openProject = useCallback(async (id: string) => {
    if (dirty && !(await ui.confirm("มีการเปลี่ยนแปลงที่ยังไม่บันทึก — ทิ้งแล้วเปิดไฟล์อื่น?"))) return false;
    const r = await projects.get(id);
    loadingRef.current = true;
    applySnapshot(r.data);
    setCurrentId(r.id); setCurrentName(r.name);
    setList(null);
    // baseline หลัง applySnapshot ค่อย flush
    baselineRef.current = null;
    setDirty(false);
    queueMicrotask(() => { loadingRef.current = false; });
    return true;
  }, [dirty, applySnapshot, ui]);

  // ── Rename: แก้ชื่อ + Save ทับ (ถ้ามี id) หรือแค่ตั้งชื่อ ──
  const rename = useCallback(async (name: string) => {
    if (!name.trim()) return;
    setCurrentName(name);
    if (currentId) {
      setSaving(true);
      try { await projects.update(currentId, name, buildSnapshot() as Record<string, unknown>); _baselineFromCurrent(); setLastSavedAt(Date.now()); _clearDraft(); }
      finally { setSaving(false); }
    } else {
      // untitled → แค่ปรับชื่อในใจ ยังไม่บันทึก (จะถาม Save แล้วใช้ชื่อนี้)
      setDirty(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, buildSnapshot, _clearDraft]);

  // ── Delete project (จาก dialog) ──────────────────────
  const removeProject = useCallback(async (id: string) => {
    if (!(await ui.confirm("ลบโปรเจกต์นี้ถาวร?"))) return false;
    await projects.remove(id);
    if (currentId === id) { setCurrentId(null); setCurrentName("Untitled"); baselineRef.current = null; setDirty(false); }
    const r = await projects.list();
    setList(r.projects);
    return true;
  }, [currentId, ui]);

  return {
    currentId, currentName, dirty, saving, lastSavedAt, list, recoverable,
    newProject, save, saveAs, openDialog, closeDialog, openProject, rename, removeProject,
    recoverDraft, discardDraft,
  };
}
