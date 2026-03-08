import { describe, expect, it, vi } from "vitest";
import { loadPreferences, persistPreferences } from "./preferences";

const STORAGE_KEY = "http-request-tracer.preferences.v1";

describe("preferences", () => {
  it("returns defaults when storage is empty or invalid", () => {
    localStorage.removeItem(STORAGE_KEY);
    expect(loadPreferences()).toEqual({
      language: "es",
      theme: "light",
      fontScale: "medium",
      showSensitiveData: false,
      certTrusted: false,
    });

    localStorage.setItem(STORAGE_KEY, "{");
    expect(loadPreferences()).toEqual({
      language: "es",
      theme: "light",
      fontScale: "medium",
      showSensitiveData: false,
      certTrusted: false,
    });
  });

  it("normalizes persisted values", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        language: "en",
        theme: "dark",
        fontScale: "large",
        showSensitiveData: 1,
        certTrusted: "yes",
      }),
    );

    expect(loadPreferences()).toEqual({
      language: "en",
      theme: "dark",
      fontScale: "large",
      showSensitiveData: true,
      certTrusted: true,
    });
  });

  it("persists preferences and swallows storage errors", () => {
    const next = {
      language: "en" as const,
      theme: "dark" as const,
      fontScale: "small" as const,
      showSensitiveData: true,
      certTrusted: true,
    };

    persistPreferences(next);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual(next);

    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => persistPreferences(next)).not.toThrow();
    setItemSpy.mockRestore();
  });
});
