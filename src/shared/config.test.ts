import { describe, expect, it } from "vitest";
import { DEFAULT_PROXY_HOST, DEFAULT_PROXY_PORT, DETAIL_TABS, DONATION_URL } from "./config";

describe("config", () => {
  it("exposes stable defaults for proxy and donation url", () => {
    expect(DEFAULT_PROXY_HOST).toBe("10.0.2.2");
    expect(DEFAULT_PROXY_PORT).toBe("8877");
    expect(DONATION_URL.startsWith("https://")).toBe(true);
  });

  it("includes all request detail tabs in order", () => {
    expect(DETAIL_TABS).toEqual(["request", "response", "headers", "cookies", "params", "timing"]);
  });
});
