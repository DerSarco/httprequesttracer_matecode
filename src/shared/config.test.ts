import { describe, expect, it } from "vitest";
import { DEFAULT_PROXY_HOST, DEFAULT_PROXY_PORT, DETAIL_TABS, DONATION_URL } from "./config";

describe("config", () => {
  it("defines stable local proxy defaults", () => {
    expect(DEFAULT_PROXY_HOST).toBe("10.0.2.2");
    expect(DEFAULT_PROXY_PORT).toBe("8877");
  });

  it("keeps detail tabs ordered and unique", () => {
    expect(DETAIL_TABS).toEqual(["request", "response", "headers", "cookies", "params", "timing"]);
    expect(new Set(DETAIL_TABS).size).toBe(DETAIL_TABS.length);
  });

  it("uses an https donation URL", () => {
    expect(DONATION_URL.startsWith("https://")).toBe(true);
  });
});
