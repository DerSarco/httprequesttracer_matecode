import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPreferences, persistPreferences } from "./preferences";

const STORAGE_KEY = "http-request-tracer.preferences.v1";

describe("preferences", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns defaults when storage is empty or invalid", () => {
    expect(loadPreferences()).toEqual({
      language: "es",
      theme: "light",
      fontScale: "medium",
      showSensitiveData: false,
      certTrusted: false,
    });

    localStorage.setItem(STORAGE_KEY, "{bad-json");
    expect(loadPreferences()).toEqual({
      language: "es",
      theme: "light",
      fontScale: "medium",
      showSensitiveData: false,
      certTrusted: false,
    });
  });

  it("sanitizes partially valid persisted preferences", () => {
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

  it("persists preferences as best effort", () => {
    persistPreferences({
      language: "en",
      theme: "dark",
      fontScale: "small",
      showSensitiveData: true,
      certTrusted: true,
    });

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "")).toEqual({
      language: "en",
      theme: "dark",
      fontScale: "small",
      showSensitiveData: true,
      certTrusted: true,
    });

    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    expect(() =>
      persistPreferences({
        language: "es",
        theme: "light",
        fontScale: "medium",
        showSensitiveData: false,
        certTrusted: false,
      }),
    ).not.toThrow();
    expect(setItemSpy).toHaveBeenCalled();
  });
});
