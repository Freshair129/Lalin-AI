// @tested FR-22.1, FR-22.2
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider, localizeError, STORAGE_LOCALE_KEY, useI18n, type TranslationKey } from "./i18n";

const recoveryLabels: TranslationKey[] = [
  "recovery.panelTitle", "recovery.openPanel",
  "recovery.reasonMissing", "recovery.reasonCorrupt", "recovery.noSourcePath", "recovery.restore",
  "recovery.success", "recovery.empty", "recovery.importMismatchConfirm", "recovery.importedNew",
  "recovery.error.notRecoverable", "recovery.error.invalidPath", "recovery.error.notLocal",
  "recovery.error.unsupportedType", "recovery.error.contentMismatch", "recovery.error.writeFailed", "recovery.error.verifyFailed",
];
function RecoveryLabels() {
  const { t } = useI18n();
  return <>{recoveryLabels.map((key) => <span data-testid={key} key={key}>{t(key, { count: 2 })}</span>)}</>;
}

function RecoveryPluralLabels({ count }: { count: number }) {
  const { tPlural } = useI18n();
  return <>
    <span data-testid="recovery-notice">{tPlural("recovery.notice", count)}</span>
    <span data-testid="recovery-compact-hint">{tPlural("recovery.compactHint", count)}</span>
  </>;
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
    expect(screen.getByTestId("recovery.reasonMissing").textContent).toBe("ไม่พบไฟล์ที่จัดเก็บไว้ในคลัง");
    expect(screen.getByTestId("recovery.reasonCorrupt").textContent).toBe("ไฟล์ที่จัดเก็บไว้ในคลังเสียหาย");
    for (const key of ["recovery.importMismatchConfirm", "recovery.error.verifyFailed"] as const) {
      expect(screen.getByTestId(key).textContent).not.toContain("object");
    }
  });

  it("uses singular English and natural Thai for one offline file", () => {
    const view = render(<I18nProvider><RecoveryPluralLabels count={1} /></I18nProvider>);
    expect(screen.getByTestId("recovery-notice").textContent).toBe("1 offline file needs repair");
    expect(screen.getByTestId("recovery-compact-hint").textContent)
      .toBe("1 offline file needs repair. Switch to Full to repair.");
    view.rerender(<I18nProvider><RecoveryPluralLabels count={2} /></I18nProvider>);
    expect(screen.getByTestId("recovery-notice").textContent).toBe("2 offline files need repair");
    expect(screen.getByTestId("recovery-compact-hint").textContent)
      .toBe("2 offline files need repair. Switch to Full to repair.");
    view.unmount();

    localStorage.setItem(STORAGE_LOCALE_KEY, "th");
    render(<I18nProvider><RecoveryPluralLabels count={1} /></I18nProvider>);
    expect(screen.getByTestId("recovery-notice").textContent).toBe("มีไฟล์ออฟไลน์ 1 ไฟล์ที่ต้องซ่อมแซม");
    expect(screen.getByTestId("recovery-compact-hint").textContent)
      .toBe("มีไฟล์ออฟไลน์ 1 ไฟล์ที่ต้องซ่อมแซม สลับไปที่ Full เพื่อซ่อมแซม");
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
