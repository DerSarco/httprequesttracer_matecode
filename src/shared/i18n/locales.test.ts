import { describe, expect, it } from "vitest";
import { LOCALES } from "./locales";

const placeholderPattern = /\{[^}]+\}/g;

const getPlaceholders = (value: string): string[] => {
  const matches = value.match(placeholderPattern) ?? [];
  return Array.from(new Set(matches)).sort();
};

describe("locales", () => {
  it("keeps locale keys aligned between Spanish and English", () => {
    const esKeys = Object.keys(LOCALES.es).sort();
    const enKeys = Object.keys(LOCALES.en).sort();

    expect(esKeys).toEqual(enKeys);
  });

  it("keeps interpolation placeholders aligned between languages", () => {
    const keys = Object.keys(LOCALES.es) as Array<keyof typeof LOCALES.es>;

    for (const key of keys) {
      expect(getPlaceholders(LOCALES.es[key])).toEqual(getPlaceholders(LOCALES.en[key]));
    }
  });
});
