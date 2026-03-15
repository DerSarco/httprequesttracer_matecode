import { afterEach, describe, expect, it, vi } from "vitest";

describe("config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("exposes stable default proxy settings and detail tabs", async () => {
    const config = await import("./config");

    expect(config.DEFAULT_PROXY_HOST).toBe("10.0.2.2");
    expect(config.DEFAULT_PROXY_PORT).toBe("8877");
    expect(config.DETAIL_TABS).toEqual(["request", "response", "headers", "cookies", "params", "timing"]);
  });

  it("falls back to the default donation URL when env is missing", async () => {
    vi.stubEnv("VITE_DONATION_URL", undefined);
    const config = await import("./config");

    expect(config.DONATION_URL).toBe("https://www.paypal.com/donate/?hosted_button_id=LU5E9BD7QFYGU");
  });

  it("uses VITE_DONATION_URL from the environment when present", async () => {
    vi.stubEnv("VITE_DONATION_URL", "https://example.com/custom-donate");
    const config = await import("./config");

    expect(config.DONATION_URL).toBe("https://example.com/custom-donate");
  });
});
