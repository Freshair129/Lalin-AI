import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  PLAY_MIGRATION_MAX_BYTES,
  parseMigrationEnvelope,
  previewPlayMigration,
  type MigrationPreview,
} from "../playMigration";
import { importPlayMigration, undoLastPlayMigration } from "../playMigrationImport";

export function PlayMigrationImport({ onChanged }: { onChanged: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [allowRepeat, setAllowRepeat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [completedUnresolved, setCompletedUnresolved] = useState<MigrationPreview["unresolved"]>([]);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [undoReason, setUndoReason] = useState("");

  useEffect(() => {
    void invoke<{ available: boolean; reason: string | null }>("get_play_migration_undo_status")
      .then((status) => {
        setUndoAvailable(status.available);
        setUndoReason(status.reason ?? "");
      })
      .catch((cause) => setError(String(cause)));
  }, []);

  useEffect(() => {
    if (!busy) return;
    const blockKeyboardInput = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", blockKeyboardInput, true);
    return () => window.removeEventListener("keydown", blockKeyboardInput, true);
  }, [busy]);

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    setPreview(null);
    setRawJson(null);
    setAllowRepeat(false);
    setError("");
    setStatus("");
    setCompletedUnresolved([]);
    if (!file) return;
    try {
      if (file.size > PLAY_MIGRATION_MAX_BYTES) {
        throw new Error("ไฟล์ migration มีขนาดเกิน 16 MiB");
      }
      const text = await file.text();
      parseMigrationEnvelope(text);
      const nextPreview = await previewPlayMigration(text);
      setRawJson(text);
      setPreview(nextPreview);
    } catch (cause) {
      setError(String(cause));
    }
  };

  const cancel = () => {
    setPreview(null);
    setRawJson(null);
    setAllowRepeat(false);
    setError("");
  };

  const confirmImport = async () => {
    if (!preview || rawJson === null || busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await importPlayMigration(rawJson, preview, allowRepeat);
      onChanged();
      setUndoAvailable(!result.cleanupPending);
      setUndoReason("");
      setCompletedUnresolved(preview.unresolved);
      setPreview(null);
      setRawJson(null);
      setStatus(
        result.cleanupPending
          ? `คิวและ EQ ถูกนำเข้าแล้ว (${preview.unresolved.length} รายการยังแก้ไขไม่ได้); จะตรวจ journal ซ้ำเมื่อเปิด Lalin Play ครั้งถัดไป`
          : `นำเข้าคิวและ EQ แล้ว (${preview.unresolved.length} รายการยังแก้ไขไม่ได้) · หยุดเล่นอยู่และไม่เล่นอัตโนมัติ`,
      );
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const undoImport = async () => {
    if (busy || !undoAvailable) return;
    const confirmed = window.confirm(
      "ย้อนกลับคิว, EQ และคลัง Play ไปยังสถานะก่อน migration ครั้งล่าสุดหรือไม่? การแก้ไขคลังหลัง migration จะไม่ถูกรวมไว้ใน undo และไฟล์สื่อจะไม่ถูกลบ",
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await undoLastPlayMigration();
      onChanged();
      setUndoAvailable(false);
      setUndoReason("");
      setStatus(
        result.cleanupPending
          ? "ย้อนกลับข้อมูลแล้ว; จะตรวจ journal ซ้ำเมื่อเปิด Lalin Play ครั้งถัดไป"
          : "ย้อนกลับคิว, EQ และคลังไปยังสถานะก่อน migration แล้ว · ไฟล์สื่อเดิมยังอยู่",
      );
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="play-migration" aria-labelledby="play-migration-title">
      <h2 id="play-migration-title">ย้ายคิวและ EQ จาก Studio</h2>
      <p>
        เลือกไฟล์ migration ที่ส่งออกจาก Studio ระบบจะแสดงตัวอย่างและตรวจไฟล์ในเครื่องก่อนเขียนข้อมูล
      </p>
      <input
        ref={fileRef}
        className="play-migration-file"
        type="file"
        accept=".json,application/json"
        aria-label="เลือกไฟล์ migration จาก Studio"
        data-testid="play-migration-file"
        onChange={(event) => void selectFile(event)}
      />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
        เลือกไฟล์ migration
      </button>
      {error ? <p className="play-migration-error" role="alert">{error}</p> : null}
      {status ? <p role="status" aria-live="polite">{status}</p> : null}
      {undoReason ? <p role="status">{undoReason}</p> : null}
      {undoAvailable ? (
        <button type="button" onClick={() => void undoImport()} disabled={busy}>
          ย้อนกลับการย้ายครั้งล่าสุด
        </button>
      ) : null}
      {completedUnresolved.length ? (
        <details className="play-migration-report">
          <summary>รายงานรายการที่แก้ไขไม่ได้ ({completedUnresolved.length})</summary>
          <ul>
            {completedUnresolved.map((item) => (
              <li key={item.entryId}>{item.displayLabel}: {item.reason}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {busy && typeof document !== "undefined" ? createPortal(
        <div className="play-migration-overlay" role="dialog" aria-modal="true" aria-labelledby="play-migration-busy">
          <p id="play-migration-busy">กำลังนำเข้าคิว/EQ และบันทึก transaction อย่างปลอดภัย…</p>
        </div>,
        document.body,
      ) : null}
      {preview ? (
        <div className="play-migration-preview" role="region" aria-label="ตัวอย่าง migration">
          <h3>ตรวจสอบก่อนนำเข้า</h3>
          <p>เพลงที่ตรวจพบและเพิ่มในคิว: {preview.plan.items.length}</p>
          <p>รายการที่แก้ไขไม่ได้และจะคงไว้ในรายงาน: {preview.unresolved.length}</p>
          <p>EQ: {preview.eq.bands.length} bands · preset กำหนดเอง {preview.eq.customPresets.length} รายการ</p>
          <p>การนำเข้าจะแทนที่คิวและ EQ ปัจจุบัน เพิ่มไฟล์เข้า library และเปิดการคืนคิวเมื่อเปิดครั้งถัดไป โดยไม่ autoplay</p>
          {preview.unresolved.length ? (
            <details>
              <summary>ดูรายการที่แก้ไขไม่ได้ ({preview.unresolved.length})</summary>
              <ul>
                {preview.unresolved.map((item) => (
                  <li key={item.entryId}>{item.displayLabel}: {item.reason}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {preview.alreadyImported ? (
            <label>
              <input
                type="checkbox"
                checked={allowRepeat}
                onChange={(event) => setAllowRepeat(event.target.checked)}
              />{" "}
              ยืนยันนำเข้า export ID นี้ซ้ำและแทนที่คิว/EQ อีกครั้ง
            </label>
          ) : null}
          <div className="play-migration-actions">
            <button type="button" onClick={cancel} disabled={busy}>ยกเลิก</button>
            <button
              type="button"
              onClick={() => void confirmImport()}
              disabled={busy || (preview.alreadyImported && !allowRepeat)}
            >
              {busy ? "กำลังนำเข้า…" : "นำเข้าและแทนที่คิว/EQ"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
