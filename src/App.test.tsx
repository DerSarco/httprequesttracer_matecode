import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App, { formatRequestTimestamp, formatStartTime, toUserError } from "./App";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { copyToClipboard } from "./shared/utils/clipboard";
import { beforeEach, describe, expect, it, vi } from "vitest";

type InvokeMock = typeof invoke & {
  mockImplementation: (fn: (cmd: string, payload?: Record<string, unknown>) => Promise<unknown>) => void;
};
type ListenMock = typeof listen & {
  mockImplementation: (
    fn: (event: string, handler: () => void) => Promise<() => void>,
  ) => void;
};
type GetCurrentWindowMock = typeof getCurrentWindow & {
  mockReturnValue: (value: { onCloseRequested: (handler: (event: { preventDefault: () => void }) => void) => Promise<() => void> }) => void;
};
type CopyToClipboardMock = typeof copyToClipboard & {
  mockResolvedValue: (value: void) => void;
  mockRejectedValueOnce: (error: Error) => void;
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
}));

vi.mock("./shared/utils/clipboard", () => ({
  copyToClipboard: vi.fn(),
}));

const adbStatus = {
  adbAvailable: true,
  adbPath: "/usr/bin/adb",
  adbVersion: "1.0.41",
  emulators: [{ serial: "emulator-5554" }],
  message: null,
};

const sessionInactive = {
  active: false,
  emulatorSerial: null,
  proxyAddress: null,
  startedAtUnixMs: null,
  caCertificatePath: null,
  lastError: null,
};

const sessionActive = {
  active: true,
  emulatorSerial: "emulator-5554",
  proxyAddress: "10.0.2.2:8877",
  startedAtUnixMs: 1700000000000,
  caCertificatePath: "/tmp/ca.pem",
  lastError: null,
};

function createCapturedRequest(
  overrides: Partial<{
    id: number;
    startedAtUnixMs: number;
    durationMs: number;
    method: string;
    url: string;
    host: string;
    path: string;
    statusCode: number;
    requestHeaders: Array<{ name: string; value: string }>;
    responseHeaders: Array<{ name: string; value: string }>;
    requestBody: string | null;
    responseBody: string | null;
    requestBodySize: number;
    responseBodySize: number;
    interceptStatus: string | null;
    originalMethod: string | null;
    originalUrl: string | null;
  }> = {},
) {
  return {
    id: 101,
    startedAtUnixMs: 1700000001000,
    durationMs: 245,
    method: "GET",
    url: "https://example.com/api?foo=bar&baz=qux",
    host: "example.com",
    path: "/api?foo=bar&baz=qux",
    statusCode: 200,
    requestHeaders: [{ name: "Accept", value: "application/json" }],
    responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    requestBody: "{\"hello\":\"world\"}",
    responseBody: "{\"ok\":true}",
    requestBodySize: 17,
    responseBodySize: 11,
    interceptStatus: null,
    originalMethod: null,
    originalUrl: null,
    ...overrides,
  };
}

let currentCapturedRequests: ReturnType<typeof createCapturedRequest>[] = [];
let currentInterceptionState: {
  enabled: boolean;
  timeoutMs: number;
  rules: Array<{ id: string; enabled: boolean; hostContains: string; pathContains: string; method: string }>;
  pendingCount: number;
  pendingRequests: Array<{
    id: number;
    startedAtUnixMs: number;
    method: string;
    url: string;
    host: string;
    path: string;
    headers: Array<{ name: string; value: string }>;
    body: string | null;
    bodySize: number;
    status: string;
    lastError: string | null;
  }>;
} = {
  enabled: false,
  timeoutMs: 12000,
  rules: [],
  pendingCount: 0,
  pendingRequests: [],
};

let exitRequestedHandler: (() => void) | null = null;
let closeRequestedHandler: ((event: { preventDefault: () => void }) => void) | null = null;

const invokeMock = invoke as InvokeMock;
const listenMock = listen as ListenMock;
const getCurrentWindowMock = getCurrentWindow as GetCurrentWindowMock;
const copyToClipboardMock = copyToClipboard as CopyToClipboardMock;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    "http-request-tracer.preferences.v1",
    JSON.stringify({
      language: "en",
      theme: "light",
      fontScale: "medium",
      showSensitiveData: false,
      certTrusted: false,
    }),
  );

  currentCapturedRequests = [];
  currentInterceptionState = {
    enabled: false,
    timeoutMs: 12000,
    rules: [],
    pendingCount: 0,
    pendingRequests: [],
  };
  exitRequestedHandler = null;
  closeRequestedHandler = null;

  listenMock.mockImplementation(async (_event, handler) => {
    exitRequestedHandler = handler;
    return vi.fn();
  });

  getCurrentWindowMock.mockReturnValue({
    onCloseRequested: async (handler) => {
      closeRequestedHandler = handler;
      return vi.fn();
    },
  });

  copyToClipboardMock.mockResolvedValue(undefined);

  invokeMock.mockImplementation(async (cmd: string, payload?: Record<string, unknown>) => {
    switch (cmd) {
      case "get_adb_status":
        return adbStatus;
      case "get_session_state":
        return sessionInactive;
      case "get_captured_requests":
        return currentCapturedRequests;
      case "get_interception_state":
        return currentInterceptionState;
      case "start_tracing":
        return sessionActive;
      case "stop_tracing":
        return sessionInactive;
      case "prepare_certificate_install":
        return {
          certLocalPath: "/tmp/ca.pem",
          certEmulatorPath: "/sdcard/ca.pem",
          installerLaunched: false,
          installationStatus: "pendingUserAction",
          verificationNote: "Instala y marca la CA como confiable.",
          instructions: "Abre la app de certificados e instala el CA.",
        };
      case "clear_captured_requests":
        currentCapturedRequests = [];
        return null;
      case "configure_interception": {
        const config = payload?.config as {
          enabled: boolean;
          timeoutMs: number;
          rules: typeof currentInterceptionState.rules;
        };
        currentInterceptionState = {
          ...currentInterceptionState,
          enabled: config.enabled,
          timeoutMs: config.timeoutMs,
          rules: config.rules,
          pendingCount: currentInterceptionState.pendingRequests.length,
        };
        return currentInterceptionState;
      }
      case "decide_intercept_request": {
        const decision = payload?.decision as { requestId: number };
        currentInterceptionState = {
          ...currentInterceptionState,
          pendingRequests: currentInterceptionState.pendingRequests.filter((request) => request.id !== decision.requestId),
          pendingCount: currentInterceptionState.pendingRequests.filter((request) => request.id !== decision.requestId).length,
        };
        return currentInterceptionState;
      }
      case "confirm_app_exit":
        return null;
      default:
        throw new Error(`Unhandled invoke: ${cmd}`);
    }
  });
});

describe("utility helpers", () => {
  it("formats start time and handles empty values", () => {
    expect(formatStartTime(null)).toBe("-");
    expect(formatStartTime(1700000000000)).toBe(new Date(1700000000000).toLocaleString());
  });

  it("formats request timestamps for table display", () => {
    expect(formatRequestTimestamp(1700000000000)).toBe(
      new Date(1700000000000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    );
  });

  it("normalizes errors for users", () => {
    expect(toUserError(null)).toBe("Ocurrió un error inesperado.");
    expect(toUserError(new Error("adb not found"))).toContain("No se encontró adb");
    expect(toUserError(new Error("offline"))).toContain("adb reconnect offline");
    expect(toUserError(new Error("Failed to bind local proxy"))).toContain("cambia el puerto de proxy");
    expect(toUserError(new Error("cannot connect to daemon"))).toContain("adb start-server");
    expect(toUserError(new Error("adb root failed"))).toContain("AVD debug/userdebug");
    expect(toUserError(new Error("adb remount failed"))).toContain("instalacion manual");
    expect(toUserError(new Error("algo"))).toBe("algo");
  });
});

describe("App", () => {
  it("loads ADB/session data and enables tracing actions", async () => {
    render(<App />);

    expect(await screen.findByText("Estado actualizado.")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Timestamp" })).toBeInTheDocument();

    const startButton = screen.getByRole("button", { name: "Start Tracing" });
    const stopButton = screen.getByRole("button", { name: "Stop Tracing" });

    expect(startButton).toBeEnabled();
    expect(stopButton).toBeDisabled();

    await userEvent.click(startButton);
    expect(await screen.findByText("Tracing iniciado. Proxy local y MITM activos.")).toBeInTheDocument();
    expect(startButton).toBeDisabled();
    expect(stopButton).toBeEnabled();

    await userEvent.click(stopButton);
    expect(await screen.findByText("Tracing detenido. Proxy removido del emulador.")).toBeInTheDocument();
    expect(startButton).toBeEnabled();
    expect(stopButton).toBeDisabled();
  });

  it("renders detail tabs, masks sensitive values, and exports content", async () => {
    currentCapturedRequests = [
      createCapturedRequest({
        requestHeaders: [
          { name: "Authorization", value: "Bearer super-secret-token" },
          { name: "Cookie", value: "session=abcdef123456; mode=full" },
        ],
        responseHeaders: [
          { name: "Set-Cookie", value: "refresh=xyz987; Path=/; HttpOnly" },
          { name: "Content-Type", value: "application/json" },
        ],
        interceptStatus: "forwarded",
        originalMethod: "POST",
        originalUrl: "https://old.example.com/api",
      }),
    ];

    render(<App />);

    expect(await screen.findByText("Estado actualizado.")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
    await userEvent.click(screen.getAllByText("/api?foo=bar&baz=qux")[0]);

    await userEvent.click(screen.getByRole("button", { name: "Headers" }));
    expect(screen.getByText("Authorization")).toBeInTheDocument();
    expect(screen.getByText("Bea***en")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cookies" }));
    expect(screen.getByText("session")).toBeInTheDocument();
    expect(screen.getAllByText("[redacted]")).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Params" }));
    expect(screen.getByText("foo")).toBeInTheDocument();
    expect(screen.getByText("qux")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Timing" }));
    expect(screen.getByText("forwarded")).toBeInTheDocument();
    expect(screen.getByText("POST https://old.example.com/api")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    await userEvent.selectOptions(screen.getByLabelText("Sensitive data"), "show");

    await userEvent.click(screen.getByRole("button", { name: "Headers" }));
    expect(screen.getByText("Bearer super-secret-token")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Copy URL" }));
    expect(copyToClipboardMock).toHaveBeenCalledWith("https://example.com/api?foo=bar&baz=qux");
    expect(await screen.findByText("Copied to clipboard.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Export as cURL" }));
    expect(copyToClipboardMock).toHaveBeenLastCalledWith(
      "curl -X GET 'https://example.com/api?foo=bar&baz=qux' -H 'Authorization: Bearer super-secret-token' -H 'Cookie: session=abcdef123456; mode=full' --data-raw '{\"hello\":\"world\"}'",
    );
  });

  it("applies combined filters and allows clearing them", async () => {
    currentCapturedRequests = [
      createCapturedRequest({
        id: 201,
        durationMs: 120,
        url: "https://example.com/api/users?page=1",
        path: "/api/users?page=1",
        requestBody: null,
        responseBody: "{\"users\":[]}",
        requestBodySize: 0,
        responseBodySize: 12,
      }),
      createCapturedRequest({
        id: 202,
        startedAtUnixMs: 1700000002000,
        durationMs: 220,
        method: "POST",
        url: "https://auth.example.com/login",
        host: "auth.example.com",
        path: "/login",
        statusCode: 401,
        requestHeaders: [{ name: "Content-Type", value: "application/json" }],
        responseHeaders: [{ name: "Content-Type", value: "application/json" }],
        requestBody: "{\"email\":\"x@y.com\"}",
        responseBody: "{\"error\":\"unauthorized\"}",
        requestBodySize: 19,
        responseBodySize: 24,
      }),
    ];

    render(<App />);
    expect(await screen.findByText("Estado actualizado.")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("auth.example.com")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Filtro texto host/path"), "auth");
    expect(screen.queryByText("example.com")).not.toBeInTheDocument();
    expect(screen.getByText("auth.example.com")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Filtro metodo HTTP"), "POST");
    await userEvent.type(screen.getByLabelText("Filtro status code"), "401");
    expect(screen.getByText("auth.example.com")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("auth.example.com")).toBeInTheDocument();
  });

  it("prepares certificate installation from the consent modal", async () => {
    render(<App />);

    expect(await screen.findByText("Estado actualizado.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Prepare CA Install" }));
    expect(screen.getByRole("dialog", { name: "Certificate install permissions" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Certificado copiado. Completa la confirmacion en el emulador.")).toBeInTheDocument();
    expect(screen.getByText(/Instala y marca la CA como confiable/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("http-request-tracer.preferences.v1") ?? "{}").certTrusted).toBe(false);
  });

  it("manages interception rules and forwards pending requests", async () => {
    currentInterceptionState = {
      enabled: false,
      timeoutMs: 12000,
      rules: [],
      pendingCount: 1,
      pendingRequests: [
        {
          id: 501,
          startedAtUnixMs: 1700000005000,
          method: "POST",
          url: "https://api.example.com/v1/login?debug=true",
          host: "api.example.com",
          path: "/v1/login?debug=true",
          headers: [
            { name: "Content-Type", value: "application/json" },
            { name: "Cookie", value: "session=abc123" },
          ],
          body: "{\"email\":\"user@example.com\"}",
          bodySize: 28,
          status: "pending",
          lastError: null,
        },
      ],
    };

    render(<App />);

    expect(await screen.findByText("Estado actualizado.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Interception/ }));
    expect(screen.getByText("api.example.com/v1/login?debug=true")).toBeInTheDocument();
    expect(screen.getByDisplayValue("POST")).toBeInTheDocument();
    expect(screen.getByDisplayValue("debug=true")).toBeInTheDocument();
    expect(screen.getByDisplayValue("session=abc123")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Interception mode" }));
    expect(await screen.findByText("Configuracion de interceptacion actualizada.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Rules" }));
    expect(screen.getByRole("dialog", { name: "Rules" })).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Timeout (ms)"));
    await userEvent.type(screen.getByLabelText("Timeout (ms)"), "999999");
    await userEvent.click(screen.getByRole("button", { name: "Add rule" }));

    const dialog = screen.getByRole("dialog", { name: "Rules" });
    const hostInput = within(dialog).getByPlaceholderText("api.example.com");
    const pathInput = within(dialog).getByPlaceholderText("/v1/users");
    const methodSelect = within(dialog).getByDisplayValue("All");

    await userEvent.type(hostInput, " api.example.com ");
    await userEvent.type(pathInput, " /v1/login ");
    await userEvent.selectOptions(methodSelect, "POST");
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));

    expect(invokeMock).toHaveBeenCalledWith("configure_interception", {
      config: {
        enabled: true,
        timeoutMs: 120000,
        rules: [
          {
            id: expect.any(String),
            enabled: true,
            hostContains: "api.example.com",
            pathContains: "/v1/login",
            method: "POST",
          },
        ],
      },
    });

    const urlInput = screen.getByDisplayValue("https://api.example.com/v1/login?debug=true");
    const queryInput = screen.getByDisplayValue("debug=true");
    const cookiesInput = screen.getByDisplayValue("session=abc123");
    const headersInput = screen.getByRole("textbox", { name: "Headers (one per line: Name: Value)" });
    const bodyInput = screen.getByRole("textbox", { name: "Body" });

    await userEvent.clear(urlInput);
    await userEvent.type(urlInput, "https://api.example.com/v1/login?debug=false");
    await userEvent.clear(queryInput);
    await userEvent.type(queryInput, "debug=false");
    await userEvent.clear(cookiesInput);
    await userEvent.type(cookiesInput, "session=changed");
    await userEvent.clear(headersInput);
    await userEvent.type(headersInput, "Content-Type: application/json{enter}X-Test: 1");
    fireEvent.change(bodyInput, { target: { value: "{\"ok\":true}" } });
    await userEvent.click(screen.getByRole("button", { name: "Forward" }));

    expect(invokeMock).toHaveBeenCalledWith("decide_intercept_request", {
      decision: {
        requestId: 501,
        action: "forward",
        method: "POST",
        url: "https://api.example.com/v1/login?debug=false",
        headers: [
          { name: "Content-Type", value: "application/json" },
          { name: "X-Test", value: "1" },
        ],
        body: "{\"ok\":true}",
        query: "debug=false",
        cookies: "session=changed",
      },
    });
    expect(await screen.findByText("Request interceptada reenviada.")).toBeInTheDocument();
    expect(screen.getAllByText("No requests pending decision.")).toHaveLength(2);
  });

  it("opens the exit prompt from tauri events and handles copy failures", async () => {
    currentCapturedRequests = [createCapturedRequest()];
    copyToClipboardMock.mockRejectedValueOnce(new Error("no clipboard"));

    render(<App />);

    expect(await screen.findByText("Estado actualizado.")).toBeInTheDocument();

    expect(await screen.findByRole("button", { name: "Copy URL" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy URL" }));
    expect(await screen.findByText("Unable to copy to clipboard.")).toBeInTheDocument();

    await act(async () => {
      exitRequestedHandler?.();
    });
    expect(screen.getByRole("dialog", { name: "Before exit" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Before exit" })).not.toBeInTheDocument();

    const preventDefault = vi.fn();
    await act(async () => {
      closeRequestedHandler?.({ preventDefault });
    });
    expect(preventDefault).toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Exit and clean" }));
    expect(invokeMock).toHaveBeenCalledWith("confirm_app_exit");
  });

  it("clears captured session from UI when clicking Clear Session", async () => {
    currentCapturedRequests = [
      createCapturedRequest({
        id: 301,
        startedAtUnixMs: 1700000003000,
        durationMs: 90,
        url: "https://clear.example.com",
        host: "clear.example.com",
        path: "/",
        requestHeaders: [],
        responseHeaders: [],
        requestBody: null,
      }),
    ];

    render(<App />);
    expect(await screen.findByText("Estado actualizado.")).toBeInTheDocument();
    expect(screen.getByText("clear.example.com")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear Session" }));

    expect(await screen.findByText("Sesion de requests limpiada.")).toBeInTheDocument();
    expect(screen.queryByText("clear.example.com")).not.toBeInTheDocument();
    expect(screen.getByText("No traffic captured yet.")).toBeInTheDocument();
  });
});
