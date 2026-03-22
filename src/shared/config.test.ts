import { describe, expect, it, vi } from "vitest";

describe("shared/config", () => {
  it("uses default proxy values and detail tabs", async () => {
    const config = await import("./config");

    expect(config.DEFAULT_PROXY_HOST).toBe("10.0.2.2");
    expect(config.DEFAULT_PROXY_PORT).toBe("8877");
    expect(config.DETAIL_TABS).toEqual(["request", "response", "headers", "cookies", "params", "timing"]);
  });

  it("uses fallback donation url when env variable is absent", async () => {
    vi.unstubAllEnvs();
    vi.resetModules();

    const config = await import("./config");

    expect(config.DONATION_URL).toBe("https://www.paypal.com/donate/?hosted_button_id=LU5E9BD7QFYGU");
    vi.unstubAllEnvs();
  });

  it("reads donation url from env variable when present", async () => {
    vi.stubEnv("VITE_DONATION_URL", "https://example.com/support");
    vi.resetModules();

    const config = await import("./config");

    expect(config.DONATION_URL).toBe("https://example.com/support");
    vi.unstubAllEnvs();
  });
});
