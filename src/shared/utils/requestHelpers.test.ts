import { afterEach, describe, expect, it, vi } from "vitest";
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
} from "./requestHelpers";

describe("requestHelpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("formats byte sizes across units", () => {
    expect(formatByteSize(999)).toBe("999 B");
    expect(formatByteSize(1024)).toBe("1.0 KB");
    expect(formatByteSize(1024 * 1024)).toBe("1.0 MB");
  });

  it("detects and masks sensitive values", () => {
    expect(isSensitiveHeader("Authorization")).toBe(true);
    expect(isSensitiveHeader("Content-Type")).toBe(false);
    expect(maskSensitiveValue("")).toBe("[redacted]");
    expect(maskSensitiveValue("short")).toBe("[redacted]");
    expect(maskSensitiveValue("abcdef123456")).toBe("abc***56");
  });

  it("looks up headers case-insensitively", () => {
    expect(getHeaderValue([{ name: "Content-Type", value: "application/json" }], "content-type")).toBe("application/json");
    expect(getHeaderValue([], "content-type")).toBeNull();
  });

  it("parses request and response cookies", () => {
    const cookies = parseCookieEntries({
      id: 1,
      startedAtUnixMs: 1,
      durationMs: 20,
      method: "GET",
      url: "https://example.com",
      host: "example.com",
      path: "/",
      statusCode: 200,
      requestHeaders: [{ name: "Cookie", value: "session=abc; mode=full; broken" }],
      responseHeaders: [
        { name: "Set-Cookie", value: "refresh=xyz; Path=/; HttpOnly" },
        { name: "Set-Cookie", value: "flagOnly; Secure" },
      ],
      requestBody: null,
      responseBody: null,
      requestBodySize: 0,
      responseBodySize: 0,
    });

    expect(cookies).toEqual([
      { source: "Request", name: "session", value: "abc" },
      { source: "Request", name: "mode", value: "full" },
      { source: "Request", name: "broken", value: "" },
      { source: "Response", name: "refresh", value: "xyz" },
      { source: "Response", name: "flagOnly", value: "" },
    ]);
  });

  it("parses params from valid and fallback URLs", () => {
    expect(
      parseParamEntries({
        id: 1,
        startedAtUnixMs: 1,
        durationMs: 20,
        method: "GET",
        url: "https://example.com/path?foo=bar&baz=qux",
        host: "example.com",
        path: "/path?foo=bar&baz=qux",
        statusCode: 200,
        requestHeaders: [],
        responseHeaders: [],
        requestBody: null,
        responseBody: null,
        requestBodySize: 0,
        responseBodySize: 0,
      }),
    ).toEqual([
      { name: "foo", value: "bar" },
      { name: "baz", value: "qux" },
    ]);

    expect(
      parseParamEntries({
        id: 2,
        startedAtUnixMs: 1,
        durationMs: 20,
        method: "GET",
        url: "not a url",
        host: "example.com",
        path: "/path?fallback=true",
        statusCode: 200,
        requestHeaders: [],
        responseHeaders: [],
        requestBody: null,
        responseBody: null,
        requestBodySize: 0,
        responseBodySize: 0,
      }),
    ).toEqual([{ name: "fallback", value: "true" }]);
  });

  it("matches status filters for prefixes, exact codes, ranges, and classes", () => {
    expect(matchesStatusFilter(204, "")).toBe(true);
    expect(matchesStatusFilter(204, "2")).toBe(true);
    expect(matchesStatusFilter(204, "204")).toBe(true);
    expect(matchesStatusFilter(404, "499-400")).toBe(true);
    expect(matchesStatusFilter(503, "5xx")).toBe(true);
    expect(matchesStatusFilter(503, "invalid")).toBe(true);
    expect(matchesStatusFilter(204, "404")).toBe(false);
  });

  it("formats headers as text and parses them back", () => {
    const headers = [
      { name: "Authorization", value: "Bearer abcdef123456" },
      { name: "Content-Type", value: "application/json" },
    ];

    expect(formatHeadersAsText(headers, false)).toBe("Authorization: Bea***56\nContent-Type: application/json");
    expect(formatHeadersAsText(headers, true)).toBe("Authorization: Bearer abcdef123456\nContent-Type: application/json");
    expect(parseHeaderLines("Content-Type: application/json\nX-Test: 1\nInvalidLine")).toEqual([
      { name: "Content-Type", value: "application/json" },
      { name: "X-Test", value: "1" },
      { name: "InvalidLine", value: "" },
    ]);
  });

  it("creates rules with stable defaults and falls back when crypto is unavailable", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "uuid-123" });
    expect(createRuleId()).toBe("uuid-123");
    expect(createEmptyRule()).toEqual({
      id: "uuid-123",
      enabled: true,
      hostContains: "",
      pathContains: "",
      method: "",
    });

    vi.stubGlobal("crypto", undefined);
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    vi.spyOn(Math, "random").mockReturnValue(0.1234);
    expect(createRuleId()).toBe("rule-1700000000000-1234");
  });

  it("builds curl commands and omits sensitive headers when requested", () => {
    const request = {
      id: 1,
      startedAtUnixMs: 1,
      durationMs: 20,
      method: "post",
      url: "https://example.com/path",
      host: "example.com",
      path: "/path",
      statusCode: 200,
      requestHeaders: [
        { name: "Authorization", value: "Bearer abcdef123456" },
        { name: "Content-Type", value: "application/json" },
      ],
      responseHeaders: [],
      requestBody: "{\"ok\":true}",
      responseBody: null,
      requestBodySize: 11,
      responseBodySize: 0,
    };

    expect(buildCurlCommand(request, false)).toBe(
      "curl -X POST 'https://example.com/path' -H 'Content-Type: application/json' --data-raw '{\"ok\":true}'",
    );
    expect(buildCurlCommand(request, true)).toContain("-H 'Authorization: Bearer abcdef123456'");
  });
});
