// @tested FR-22.1, FR-22.2
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider, localizeError, STORAGE_LOCALE_KEY, useI18n } from "./i18n";

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
