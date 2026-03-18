import { describe, expect, it } from "vitest";
import { LOCALES } from "./locales";

function placeholders(value: string): string[] {
  return Array.from(value.matchAll(/\{([^}]+)\}/g), (match) => match[1]).sort();
}

describe("locales", () => {
  it("keeps English and Spanish locale keys in sync", () => {
    const esKeys = Object.keys(LOCALES.es).sort();
    const enKeys = Object.keys(LOCALES.en).sort();
    expect(esKeys).toEqual(enKeys);
  });

  it("keeps placeholders aligned across locales", () => {
    const keys = Object.keys(LOCALES.en) as Array<keyof typeof LOCALES.en>;
    for (const key of keys) {
      expect(placeholders(LOCALES.es[key])).toEqual(placeholders(LOCALES.en[key]));
    }
  });
});
