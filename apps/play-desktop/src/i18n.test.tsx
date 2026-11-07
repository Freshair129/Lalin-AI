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
