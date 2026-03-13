import { describe, expect, it } from "vitest";
import { LOCALES } from "./locales";

describe("shared/i18n/locales", () => {
  it("keeps locale keys aligned between Spanish and English", () => {
    const esKeys = Object.keys(LOCALES.es).sort();
    const enKeys = Object.keys(LOCALES.en).sort();

    expect(enKeys).toEqual(esKeys);
  });

  it("keeps interpolation placeholders aligned for translated strings", () => {
    const getPlaceholders = (value: string): string[] => {
      const matches = value.match(/\{[^}]+\}/g) ?? [];
      return matches.slice().sort();
    };

    for (const key of Object.keys(LOCALES.en)) {
      const enValue = LOCALES.en[key as keyof typeof LOCALES.en];
      const esValue = LOCALES.es[key as keyof typeof LOCALES.es];
      expect(getPlaceholders(enValue)).toEqual(getPlaceholders(esValue));
    }
  });
});
