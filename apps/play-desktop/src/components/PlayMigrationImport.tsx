// @req FR-22.2 — Localized migration workflow, confirmation and status
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
import { useI18n, localizeError, type TranslationKey } from "../i18n";

export function PlayMigrationImport({ onChanged }: { onChanged: () => void }) {
  const { t, locale } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [allowRepeat, setAllowRepeat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<{ key: TranslationKey; variables?: Record<string, string | number> } | null>(null);
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
    setStatus(null);
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
    setStatus(null);
    try {
      const result = await importPlayMigration(rawJson, preview, allowRepeat);
      onChanged();
      setUndoAvailable(!result.cleanupPending);
      setUndoReason("");
      setCompletedUnresolved(preview.unresolved);
      setPreview(null);
      setRawJson(null);
      setStatus({
        key: result.cleanupPending ? "migration.cleanupPending" : "migration.importComplete",
        variables: { count: preview.unresolved.length },
      });
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const undoImport = async () => {
    if (busy || !undoAvailable) return;
    const confirmed = window.confirm(
      t("migration.undoConfirm"),
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    setStatus(null);
    try {
      const result = await undoLastPlayMigration();
      onChanged();
      setUndoAvailable(false);
      setUndoReason("");
      setStatus({ key: result.cleanupPending ? "migration.undoCleanupPending" : "migration.undoComplete" });
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="play-migration" aria-labelledby="play-migration-title">
      <h2 id="play-migration-title">{t("migration.title")}</h2>
      <p>{t("migration.intro")}</p>
      <input
        ref={fileRef}
        className="play-migration-file"
        type="file"
        accept=".json,application/json"
        aria-label={t("migration.chooseAria")}
        data-testid="play-migration-file"
        onChange={(event) => void selectFile(event)}
      />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
        {t("migration.choose")}
      </button>
      {error ? <p className="play-migration-error" role="alert">{localizeError(error, locale)}</p> : null}
      {status ? <p role="status" aria-live="polite">{t(status.key, status.variables)}</p> : null}
      {undoReason ? <p role="status">{localizeError(undoReason, locale)}</p> : null}
      {undoAvailable ? (
        <button type="button" onClick={() => void undoImport()} disabled={busy}>
          {t("migration.undo")}
        </button>
      ) : null}
      {completedUnresolved.length ? (
        <details className="play-migration-report">
          <summary>{t("migration.unresolvedReport", { count: completedUnresolved.length })}</summary>
          <ul>
            {completedUnresolved.map((item) => (
              <li key={item.entryId}>{item.displayLabel}: {item.reason}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {busy && typeof document !== "undefined" ? createPortal(
        <div className="play-migration-overlay" role="dialog" aria-modal="true" aria-labelledby="play-migration-busy">
          <p id="play-migration-busy">{t("migration.busy")}</p>
        </div>,
        document.body,
      ) : null}
      {preview ? (
        <div className="play-migration-preview" role="region" aria-label={t("migration.previewAria")}>
          <h3>{t("migration.review")}</h3>
          <p>{t("migration.addedTracks", { count: preview.plan.items.length })}</p>
          <p>{t("migration.unresolvedCount", { count: preview.unresolved.length })}</p>
          <p>{t("migration.eqSummary", { bands: preview.eq.bands.length, presets: preview.eq.customPresets.length })}</p>
          <p>{t("migration.replaceSummary")}</p>
          {preview.unresolved.length ? (
            <details>
              <summary>{t("migration.viewUnresolved", { count: preview.unresolved.length })}</summary>
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
              {t("migration.repeatConfirm")}
            </label>
          ) : null}
          <div className="play-migration-actions">
            <button type="button" onClick={cancel} disabled={busy}>{t("migration.cancel")}</button>
            <button
              type="button"
              onClick={() => void confirmImport()}
              disabled={busy || (preview.alreadyImported && !allowRepeat)}
            >
              {busy ? t("migration.importing") : t("migration.importReplace")}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
