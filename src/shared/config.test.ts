import { afterEach, describe, expect, it, vi } from "vitest";

describe("shared/config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses defaults when env is not provided", async () => {
    vi.stubEnv("VITE_DONATION_URL", "");
    const { DEFAULT_PROXY_HOST, DEFAULT_PROXY_PORT, DONATION_URL, DETAIL_TABS } = await import("./config");

    expect(DEFAULT_PROXY_HOST).toBe("10.0.2.2");
    expect(DEFAULT_PROXY_PORT).toBe("8877");
    expect(DONATION_URL).toBe("https://www.paypal.com/donate/?hosted_button_id=LU5E9BD7QFYGU");
    expect(DETAIL_TABS).toEqual(["request", "response", "headers", "cookies", "params", "timing"]);
  });

  it("uses VITE_DONATION_URL override when present", async () => {
    vi.stubEnv("VITE_DONATION_URL", "https://example.com/donate");
    const { DONATION_URL } = await import("./config");

    expect(DONATION_URL).toBe("https://example.com/donate");
  });
});
