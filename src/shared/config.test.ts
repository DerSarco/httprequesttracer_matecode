import { afterEach, describe, expect, it, vi } from "vitest";

describe("config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("exports stable defaults and detail tabs", async () => {
    const config = await import("./config");

    expect(config.DEFAULT_PROXY_HOST).toBe("10.0.2.2");
    expect(config.DEFAULT_PROXY_PORT).toBe("8877");
    expect(config.DETAIL_TABS).toEqual(["request", "response", "headers", "cookies", "params", "timing"]);
  });

  it("uses fallback donation URL when env var is missing", async () => {
    vi.unstubAllEnvs();
    vi.resetModules();

    const config = await import("./config");
    expect(config.DONATION_URL).toBe("https://www.paypal.com/donate/?hosted_button_id=LU5E9BD7QFYGU");
  });

  it("uses VITE_DONATION_URL when provided", async () => {
    vi.stubEnv("VITE_DONATION_URL", "https://example.com/donate");
    vi.resetModules();

    const config = await import("./config");
    expect(config.DONATION_URL).toBe("https://example.com/donate");
  });
});
