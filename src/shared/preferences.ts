import type { UserPreferences } from "./contracts";

const PREFERENCES_STORAGE_KEY = "http-request-tracer.preferences.v1";

const DEFAULT_PREFERENCES: UserPreferences = {
  language: "es",
  theme: "light",
  fontScale: "medium",
  showSensitiveData: false,
  certTrusted: false,
};

export function loadPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      language: parsed.language === "en" ? "en" : "es",
      theme: parsed.theme === "dark" ? "dark" : "light",
      fontScale:
        parsed.fontScale === "small" || parsed.fontScale === "large" ? parsed.fontScale : "medium",
      showSensitiveData: Boolean(parsed.showSensitiveData),
      certTrusted: Boolean(parsed.certTrusted),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function persistPreferences(next: UserPreferences) {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // noop: preference persistence is best-effort only.
  }
}
