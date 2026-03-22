import { describe, expect, it } from "vitest";
import { LOCALES } from "./locales";

const placeholderPattern = /\{([^}]+)\}/g;

const getPlaceholders = (value: string): string[] =>
  Array.from(value.matchAll(placeholderPattern), (match) => match[1]).sort();

describe("shared/i18n/locales", () => {
  it("keeps the same locale keys for es and en", () => {
    const esKeys = Object.keys(LOCALES.es).sort();
    const enKeys = Object.keys(LOCALES.en).sort();

    expect(esKeys).toEqual(enKeys);
  });

  it("keeps placeholder tokens aligned between es and en", () => {
    for (const key of Object.keys(LOCALES.es)) {
      const esText = LOCALES.es[key as keyof typeof LOCALES.es];
      const enText = LOCALES.en[key as keyof typeof LOCALES.en];

      expect(getPlaceholders(esText)).toEqual(getPlaceholders(enText));
    }
  });
});
