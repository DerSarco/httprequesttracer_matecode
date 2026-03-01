import { describe, expect, it, vi } from "vitest";
import type { CapturedExchange, HeaderEntry } from "../contracts";
import {
  buildCurlCommand,
  createEmptyRule,
  createRuleId,
  formatByteSize,
  formatHeadersAsText,
  getHeaderValue,
  isSensitiveHeader,
  maskSensitiveValue,
  matchesStatusFilter,
  parseCookieEntries,
  parseHeaderLines,
  parseParamEntries,
  toUserError,
} from "./requestHelpers";

const sampleHeaders: HeaderEntry[] = [
  { name: "Authorization", value: "Bearer super-secret-token" },
  { name: "Accept", value: "application/json" },
];

const sampleRequest: CapturedExchange = {
  id: 10,
  startedAtUnixMs: 1700000000000,
  durationMs: 250,
  method: "post",
  url: "https://api.example.com/v1/users?from=url&lang=en",
  host: "api.example.com",
  path: "/v1/users?from=path&lang=es",
  statusCode: 201,
  requestHeaders: [
    { name: "Cookie", value: "session=abc123; theme=dark" },
    ...sampleHeaders,
  ],
  responseHeaders: [
    { name: "Set-Cookie", value: "token=xyz999; Path=/; HttpOnly" },
    { name: "Content-Type", value: "application/json" },
  ],
  requestBody: '{"name":"Ana"}',
  responseBody: '{"ok":true}',
  requestBodySize: 14,
  responseBodySize: 11,
};

describe("requestHelpers", () => {
  it("normalizes user-facing error messages", () => {
    expect(toUserError(null)).toBe("Ocurrió un error inesperado.");
    expect(toUserError(new Error("adb root failed"))).toContain("AVD debug/userdebug");
    expect(toUserError(new Error("adb remount failed"))).toContain("instalacion manual");
    expect(toUserError(new Error("address already in use"))).toContain("cambia el puerto");
  });

  it("formats byte sizes across units", () => {
    expect(formatByteSize(900)).toBe("900 B");
    expect(formatByteSize(2048)).toBe("2.0 KB");
    expect(formatByteSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("detects and masks sensitive headers", () => {
    expect(isSensitiveHeader("Authorization")).toBe(true);
    expect(isSensitiveHeader("X-Trace-Id")).toBe(false);
    expect(maskSensitiveValue("short")).toBe("[redacted]");
    expect(maskSensitiveValue("Bearer token value")).toBe("Bea***ue");
  });

  it("finds headers case-insensitively and formats them for export", () => {
    expect(getHeaderValue(sampleHeaders, "authorization")).toBe("Bearer super-secret-token");
    expect(getHeaderValue(sampleHeaders, "missing")).toBeNull();

    expect(formatHeadersAsText(sampleHeaders, false)).toBe(
      ["Authorization: Bea***en", "Accept: application/json"].join("\n"),
    );
    expect(formatHeadersAsText(sampleHeaders, true)).toContain("Bearer super-secret-token");
  });

  it("parses cookies from request and response headers", () => {
    expect(parseCookieEntries(sampleRequest)).toEqual([
      { source: "Request", name: "session", value: "abc123" },
      { source: "Request", name: "theme", value: "dark" },
      { source: "Response", name: "token", value: "xyz999" },
    ]);
  });

  it("parses params from a valid url and falls back to the path query string", () => {
    expect(parseParamEntries(sampleRequest)).toEqual([
      { name: "from", value: "url" },
      { name: "lang", value: "en" },
    ]);

    expect(
      parseParamEntries({
        ...sampleRequest,
        url: "not a valid url",
      }),
    ).toEqual([
      { name: "from", value: "path" },
      { name: "lang", value: "es" },
    ]);
  });

  it("supports status code matching by prefix, exact value, range, class, and empty filters", () => {
    expect(matchesStatusFilter(201, "")).toBe(true);
    expect(matchesStatusFilter(201, "2")).toBe(true);
    expect(matchesStatusFilter(201, "201")).toBe(true);
    expect(matchesStatusFilter(201, "200-299")).toBe(true);
    expect(matchesStatusFilter(201, "2xx")).toBe(true);
    expect(matchesStatusFilter(201, "500-599")).toBe(false);
  });

  it("parses header text lines and ignores empty entries", () => {
    expect(parseHeaderLines("X-Test: one\nNoValue\n\nAnother: two")).toEqual([
      { name: "X-Test", value: "one" },
      { name: "NoValue", value: "" },
      { name: "Another", value: "two" },
    ]);
  });

  it("creates interception rules and curl exports", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValue("rule-id-123"),
    });

    const createdRule = createEmptyRule();
    expect(createdRule).toEqual({
      id: "rule-id-123",
      enabled: true,
      hostContains: "",
      pathContains: "",
      method: "",
    });
    expect(createRuleId()).toBe("rule-id-123");

    expect(buildCurlCommand(sampleRequest, false)).toBe(
      "curl -X POST 'https://api.example.com/v1/users?from=url&lang=en' -H 'Accept: application/json' --data-raw '{\"name\":\"Ana\"}'",
    );
    expect(buildCurlCommand(sampleRequest, true)).toContain("Authorization: Bearer super-secret-token");
  });
});
