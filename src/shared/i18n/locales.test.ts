import { describe, expect, it } from "vitest";
import { LOCALES } from "./locales";

const TOKEN_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;

function extractTokens(input: string): string[] {
  const tokens = new Set<string>();
  for (const match of input.matchAll(TOKEN_PATTERN)) {
    tokens.add(match[1]);
  }
  return [...tokens].sort();
}

describe("locales", () => {
  it("keeps translation keys in sync across languages", () => {
    const spanishKeys = Object.keys(LOCALES.es).sort();
    const englishKeys = Object.keys(LOCALES.en).sort();
    expect(spanishKeys).toEqual(englishKeys);
  });

  it("keeps interpolation tokens consistent for each translation key", () => {
    for (const key of Object.keys(LOCALES.en) as Array<keyof typeof LOCALES.en>) {
      const englishTokens = extractTokens(LOCALES.en[key]);
      const spanishTokens = extractTokens(LOCALES.es[key]);
      expect(spanishTokens).toEqual(englishTokens);
    }
  });

  it("avoids empty translation strings", () => {
    for (const locale of Object.values(LOCALES)) {
      for (const value of Object.values(locale)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
