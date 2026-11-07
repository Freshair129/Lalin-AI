// @tested FR-22.1, FR-22.2
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider, localizeError, STORAGE_LOCALE_KEY, useI18n, type TranslationKey } from "./i18n";

const recoveryLabels: TranslationKey[] = [
  "recovery.notice", "recovery.panelTitle", "recovery.openPanel", "recovery.compactHint",
  "recovery.reasonMissing", "recovery.reasonCorrupt", "recovery.noSourcePath", "recovery.restore",
  "recovery.success", "recovery.empty", "recovery.importMismatchConfirm", "recovery.importedNew",
  "recovery.error.notRecoverable", "recovery.error.invalidPath", "recovery.error.notLocal",
  "recovery.error.unsupportedType", "recovery.error.contentMismatch", "recovery.error.writeFailed", "recovery.error.verifyFailed",
];
function RecoveryLabels() {
  const { t } = useI18n();
  return <>{recoveryLabels.map((key) => <span data-testid={key} key={key}>{t(key, { count: 2 })}</span>)}</>;
}

function LocaleProbe() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div>
      <span>{locale}</span>
      <span>{t("app.library")}</span>
      <button onClick={() => setLocale("th")}>TH</button>
    </div>
  );
}

beforeEach(() => localStorage.clear());

describe("Lalin Play localization", () => {
  it("provides every recovery label in both locales", () => {
    const first = render(<I18nProvider><RecoveryLabels /></I18nProvider>);
    const english = recoveryLabels.map((key) => screen.getByTestId(key).textContent);
    first.unmount();
    localStorage.setItem(STORAGE_LOCALE_KEY, "th");
    render(<I18nProvider><RecoveryLabels /></I18nProvider>);
    recoveryLabels.forEach((key, index) => {
      const thai = screen.getByTestId(key).textContent;
      expect(english[index]).toBeTruthy();
      expect(thai).toBeTruthy();
      expect(thai).not.toBe(english[index]);
      expect(thai).not.toContain("{count}");
    });
  });
  it("localizes every recovery error in English and Thai", () => {
    for (const code of ["not-recoverable", "invalid-path", "not-local", "unsupported-type", "content-mismatch", "write-failed", "verify-failed"]) {
      const message = `recovery:${code}`;
      expect(localizeError(message, "en")).not.toBe(message);
      expect(localizeError(message, "th")).not.toBe(message);
      expect(localizeError(message, "en")).not.toBe(localizeError(message, "th"));
    }
  });

  it("localizes every relink code and native resolve error in both locales", () => {
    const codes = ["unknown-track", "retired-track", "invalid-path", "not-local", "not-a-file", "unsupported-type", "different-content", "managed-unsupported", "write-failed", "duplicate:Song"];
    const nativeErrors = [
      "ไฟล์นี้ไม่อยู่ในคลังที่อนุญาต กรุณาเลือกไฟล์เพิ่มอีกครั้ง",
      "ไม่พบไฟล์นี้ กรุณาเพิ่มไฟล์จากตำแหน่งใหม่",
      "ไฟล์เปลี่ยนตำแหน่งหรืออยู่นอกขอบเขตที่เลือก กรุณาเลือกไฟล์อีกครั้ง",
      "ไม่พบคลัง offline",
      "ไฟล์ offline อยู่นอกคลังที่จัดการโดย Lalin Play",
    ];
    for (const message of [...codes.map((code) => `relink:${code}`), ...nativeErrors]) {
      const en = localizeError(message, "en");
      const th = localizeError(message, "th");
      expect(en).not.toBe(message);
      expect(th).not.toBe(message);
      expect(en).not.toBe(th);
    }
    expect(localizeError("relink:duplicate:Song", "en")).toContain("Song");
  });
  it("defaults to English, persists changes, and updates the document language", async () => {
    render(<I18nProvider><LocaleProbe /></I18nProvider>);
    expect(screen.getByText("en")).not.toBeNull();
    expect(screen.getByText("LIBRARY")).not.toBeNull();
    expect(localStorage.getItem(STORAGE_LOCALE_KEY)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "TH" }));
    expect(screen.getByText("คลังเพลง")).not.toBeNull();
    expect(localStorage.getItem(STORAGE_LOCALE_KEY)).toBe("th");
    await waitFor(() => expect(document.documentElement.lang).toBe("th"));
  });

  it("falls back to English for an unsupported locale and localizes owned errors", () => {
    localStorage.setItem(STORAGE_LOCALE_KEY, "fr");
    render(<I18nProvider><LocaleProbe /></I18nProvider>);
    expect(screen.getByText("LIBRARY")).not.toBeNull();
    expect(localizeError("ไม่สามารถถอดรหัสสื่อได้ (codec ไม่รองรับหรือไฟล์เสียหาย) กรุณาเลือกไฟล์อื่น", "en"))
      .toContain("Could not decode this media");
  });
});
