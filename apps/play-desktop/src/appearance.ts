// Appearance preference (System / Light / Dark), persisted locally.
// The resolved theme is written to <html data-theme>, which the CSS tokens key off.
import { useEffect, useState } from "react";

export type AppearancePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const STORAGE_APPEARANCE_KEY = "lalin-play:v1:appearance";
const LIGHT_QUERY = "(prefers-color-scheme: light)";

export function loadAppearance(): AppearancePreference {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_APPEARANCE_KEY) : null;
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {}
  return "system";
}

function systemPrefersLight(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(LIGHT_QUERY).matches
    : false;
}

export function resolveTheme(preference: AppearancePreference, prefersLight = systemPrefersLight()): ResolvedTheme {
  if (preference === "system") return prefersLight ? "light" : "dark";
  return preference;
}

export function applyAppearance(preference: AppearancePreference): ResolvedTheme {
  const theme = resolveTheme(preference);
  if (typeof document !== "undefined") document.documentElement.dataset.theme = theme;
  return theme;
}

export function useAppearance(): [AppearancePreference, (next: AppearancePreference) => void] {
  const [preference, setPreference] = useState<AppearancePreference>(loadAppearance);
  useEffect(() => {
    applyAppearance(preference);
    if (preference !== "system" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(LIGHT_QUERY);
    const onChange = () => applyAppearance("system");
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, [preference]);
  const update = (next: AppearancePreference) => {
    try {
      localStorage.setItem(STORAGE_APPEARANCE_KEY, next);
    } catch {}
    setPreference(next);
  };
  return [preference, update];
}
