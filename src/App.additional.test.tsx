import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { beforeEach, describe, expect, it, vi } from "vitest";

type InvokeMock = typeof invoke & { mockImplementation: (fn: (cmd: string, payload?: unknown) => Promise<unknown>) => void };

let exitRequestedHandler: (() => void | Promise<void>) | null = null;
let closeRequestedHandler:
  | ((event: { preventDefault: () => void }) => void | Promise<void>)
  | null = null;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event: string, handler: () => void | Promise<void>) => {
    exitRequestedHandler = handler;
    return vi.fn();
  }),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    onCloseRequested: vi.fn(async (handler: (event: { preventDefault: () => void }) => void | Promise<void>) => {
      closeRequestedHandler = handler;
      return vi.fn();
    }),
  })),
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

let currentCapturedRequests: Array<{
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
  intercepted?: boolean;
  interceptStatus?: string | null;
  originalMethod?: string | null;
  originalUrl?: string | null;
}> = [];

let currentInterception = {
  enabled: false,
  timeoutMs: 12000,
  rules: [] as Array<{ id: string; enabled: boolean; hostContains: string; pathContains: string; method: string }>,
  pendingCount: 0,
  pendingRequests: [] as Array<{
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
  }>,
};

let prepareCertificateResult = {
  certLocalPath: "/tmp/matecode-http-tracer-ca.cer",
  certEmulatorPath: "/sdcard/Download/matecode-http-tracer-ca.cer",
  installerLaunched: true,
  installationStatus: "pendingUserAction" as const,
  verificationNote: "Open Android Security to complete trust",
  instructions: "Certificate copied",
};

let lastConfiguredPayload: unknown = null;
let lastDecisionPayload: unknown = null;
let confirmExitCalls = 0;

const invokeMock = invoke as InvokeMock;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    "http-request-tracer.preferences.v1",
    JSON.stringify({
      language: "en",
      theme: "light",
      fontScale: "medium",
      showSensitiveData: false,
      certTrusted: true,
    }),
  );

  exitRequestedHandler = null;
  closeRequestedHandler = null;
  lastConfiguredPayload = null;
  lastDecisionPayload = null;
  confirmExitCalls = 0;
  vi.mocked(openUrl).mockResolvedValue(undefined);

  currentCapturedRequests = [];
  currentInterception = {
    enabled: false,
    timeoutMs: 12000,
    rules: [],
    pendingCount: 0,
    pendingRequests: [],
  };

  prepareCertificateResult = {
    certLocalPath: "/tmp/matecode-http-tracer-ca.cer",
    certEmulatorPath: "/sdcard/Download/matecode-http-tracer-ca.cer",
    installerLaunched: true,
    installationStatus: "pendingUserAction",
    verificationNote: "Open Android Security to complete trust",
    instructions: "Certificate copied",
  };

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });

  invokeMock.mockImplementation(async (cmd: string, payload?: unknown) => {
    switch (cmd) {
      case "get_adb_status":
        return adbStatus;
      case "get_session_state":
        return sessionInactive;
      case "get_captured_requests":
        return currentCapturedRequests;
      case "get_interception_state":
        return currentInterception;
      case "prepare_certificate_install":
        return prepareCertificateResult;
      case "configure_interception":
        lastConfiguredPayload = payload;
        currentInterception = {
          enabled: Boolean((payload as { config: { enabled: boolean } }).config.enabled),
          timeoutMs: (payload as { config: { timeoutMs: number } }).config.timeoutMs,
          rules: (payload as { config: { rules: typeof currentInterception.rules } }).config.rules,
          pendingCount: currentInterception.pendingCount,
          pendingRequests: currentInterception.pendingRequests,
        };
        return currentInterception;
      case "decide_intercept_request":
        lastDecisionPayload = payload;
        currentInterception = {
          ...currentInterception,
          pendingCount: 0,
          pendingRequests: [],
        };
        return currentInterception;
      case "confirm_app_exit":
        confirmExitCalls += 1;
        return null;
      case "clear_captured_requests":
        currentCapturedRequests = [];
        return null;
      default:
        throw new Error(`Unhandled invoke: ${cmd}`);
    }
  });
});

describe("App additional coverage", () => {
  it("shows interception status and rules count in requests and keeps them in sync", async () => {
    render(<App />);

    expect(await screen.findByText("Status updated.")).toBeInTheDocument();
    expect(screen.getByText("OFF").closest(".traffic-badge")).toHaveClass("is-off");
    expect(screen.getByText("0 configured")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Interception/ }));
    await userEvent.click(screen.getByRole("button", { name: "Rules" }));

    const rulesDialog = screen.getByRole("dialog", { name: "Rules" });
    expect(within(rulesDialog).getByText("No active rules: intercept everything.")).toBeInTheDocument();
    expect(within(rulesDialog).getByText('Add your first one from "Add rule" to start filtering.')).toBeInTheDocument();
    await userEvent.click(within(rulesDialog).getByRole("button", { name: "Add rule" }));
    await userEvent.type(within(rulesDialog).getByLabelText("Host contains"), " auth.example.com ");
    await userEvent.click(within(rulesDialog).getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(lastConfiguredPayload).toEqual({
        config: {
          enabled: false,
          timeoutMs: 12000,
          rules: [
            {
              id: expect.any(String),
              enabled: true,
              hostContains: "auth.example.com",
              pathContains: "",
              method: "",
            },
          ],
        },
      }),
    );

    await userEvent.click(screen.getByLabelText("Interception mode"));
    await waitFor(() =>
      expect(lastConfiguredPayload).toEqual({
        config: {
          enabled: true,
          timeoutMs: 12000,
          rules: [
            {
              id: expect.any(String),
              enabled: true,
              hostContains: "auth.example.com",
              pathContains: "",
              method: "",
            },
          ],
        },
      }),
    );

    expect(screen.getByText("1 active / 1 configured")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Requests" }));
    expect(screen.getByText("ON").closest(".traffic-badge")).toHaveClass("is-on");
    expect(screen.getByText("1 active / 1 configured")).toBeInTheDocument();
  });

  it("updates settings and copies request data with sensitive-data handling", async () => {
    currentCapturedRequests = [
      {
        id: 901,
        startedAtUnixMs: 1700000005000,
        durationMs: 85,
        method: "POST",
        url: "https://api.example.com/login",
        host: "api.example.com",
        path: "/login",
        statusCode: 200,
        requestHeaders: [
          { name: "Authorization", value: "Bearer abcdef1234" },
          { name: "Content-Type", value: "application/json" },
        ],
        responseHeaders: [{ name: "Set-Cookie", value: "session=xyz; Path=/; HttpOnly" }],
        requestBody: "{\"ok\":true}",
        responseBody: "{\"token\":\"123\"}",
        requestBodySize: 11,
        responseBodySize: 15,
      },
    ];

    render(<App />);

    expect(await screen.findByText("Status updated.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("row", { name: /api\.example\.com \/login 200 85 ms/i }));

    await userEvent.click(screen.getByRole("button", { name: "Headers" }));
    expect(screen.getByText("Bea***34")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Export as cURL" }));
    const clipboardWrite = vi.mocked(navigator.clipboard.writeText);
    expect(clipboardWrite).toHaveBeenCalledWith(
      "curl -X POST 'https://api.example.com/login' -H 'Content-Type: application/json' --data-raw '{\"ok\":true}'",
    );

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    await userEvent.selectOptions(screen.getByLabelText("Sensitive data"), "show");
    await userEvent.click(screen.getByRole("button", { name: "Close settings" }));

    expect(screen.getByText("Bearer abcdef1234")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Copy URL" }));
    expect(clipboardWrite).toHaveBeenLastCalledWith("https://api.example.com/login");
    expect(await screen.findByText("Copied to clipboard.")).toBeInTheDocument();
  });

  it("runs the certificate install flow and records follow-up details", async () => {
    render(<App />);

    expect(await screen.findByText("Status updated.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Prepare CA Install" }));

    expect(screen.getByRole("dialog", { name: "Certificate install permissions" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Certificate copied. Complete the confirmation on the emulator.")).toBeInTheDocument();
    expect(screen.getByText(/Certificate copied Verification:/)).toBeInTheDocument();

    const persistedPreferences = JSON.parse(localStorage.getItem("http-request-tracer.preferences.v1") ?? "{}");
    expect(persistedPreferences.certTrusted).toBe(false);
  });

  it("applies interception rules and forwards edited pending requests", async () => {
    currentInterception = {
      enabled: false,
      timeoutMs: 12000,
      rules: [],
      pendingCount: 1,
      pendingRequests: [
        {
          id: 321,
          startedAtUnixMs: 1700000007000,
          method: "POST",
          url: "https://auth.example.com/login?next=%2Fhome",
          host: "auth.example.com",
          path: "/login?next=%2Fhome",
          headers: [
            { name: "Cookie", value: "session=abc" },
            { name: "Content-Type", value: "application/json" },
          ],
          body: "{\"email\":\"a@example.com\"}",
          bodySize: 25,
          status: "pending",
          lastError: null,
        },
      ],
    };

    render(<App />);

    expect(await screen.findByText("Status updated.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Interception/ })).toHaveClass("active"));
    expect(screen.getByText("auth.example.com/login?next=%2Fhome")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Rules" }));
    const rulesDialog = screen.getByRole("dialog", { name: "Rules" });
    await userEvent.click(within(rulesDialog).getByRole("button", { name: "Add rule" }));
    await userEvent.clear(within(rulesDialog).getByLabelText("Timeout (ms)"));
    await userEvent.type(within(rulesDialog).getByLabelText("Timeout (ms)"), "999999");
    await userEvent.type(within(rulesDialog).getByLabelText("Host contains"), " auth.example.com ");
    await userEvent.type(within(rulesDialog).getByLabelText("Path contains"), " /login ");
    await userEvent.selectOptions(within(rulesDialog).getByLabelText("Method"), "POST");
    await userEvent.click(within(rulesDialog).getByRole("button", { name: "Apply" }));

    expect(lastConfiguredPayload).toEqual({
      config: {
        enabled: false,
        timeoutMs: 120000,
        rules: [
          {
            id: expect.any(String),
            enabled: true,
            hostContains: "auth.example.com",
            pathContains: "/login",
            method: "POST",
          },
        ],
      },
    });

    await userEvent.clear(screen.getByLabelText("Method"));
    await userEvent.type(screen.getByLabelText("Method"), "PATCH");
    await userEvent.clear(screen.getByLabelText("URL"));
    await userEvent.type(screen.getByLabelText("URL"), "https://auth.example.com/session");
    await userEvent.clear(screen.getByLabelText("Query string"));
    await userEvent.type(screen.getByLabelText("Query string"), "via=editor");
    await userEvent.clear(screen.getByLabelText("Cookies"));
    await userEvent.type(screen.getByLabelText("Cookies"), "session=updated");
    await userEvent.clear(screen.getByLabelText("Headers (one per line: Name: Value)"));
    await userEvent.type(screen.getByLabelText("Headers (one per line: Name: Value)"), "X-Test: one\nBroken");
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "{\"patched\":true}" } });
    await userEvent.click(screen.getByRole("button", { name: "Forward" }));

    await waitFor(() =>
      expect(lastDecisionPayload).toEqual({
        decision: {
          requestId: 321,
          action: "forward",
          method: "PATCH",
          url: "https://auth.example.com/session",
          headers: [
            { name: "X-Test", value: "one" },
            { name: "Broken", value: "" },
          ],
          body: "{\"patched\":true}",
          query: "via=editor",
          cookies: "session=updated",
        },
      }),
    );
    expect(await screen.findByText("Intercepted request forwarded.")).toBeInTheDocument();
  });

  it("opens the exit modal from the Tauri events and confirms exit cleanup", async () => {
    render(<App />);

    expect(await screen.findByText("Status updated.")).toBeInTheDocument();

    await act(async () => {
      await exitRequestedHandler?.();
    });

    expect(screen.getByRole("dialog", { name: "Before exit" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Exit and clean" }));

    await waitFor(() => {
      expect(confirmExitCalls).toBe(1);
    });

    await act(async () => {
      await closeRequestedHandler?.({ preventDefault: vi.fn() });
    });
    expect(screen.getByRole("dialog", { name: "Before exit" })).toBeInTheDocument();
  });

  it("shows the donation explainer and lets the user cancel without leaving the app", async () => {
    render(<App />);

    expect(await screen.findByText("Status updated.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Donate" }));
    expect(openUrl).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog", { name: "Before opening PayPal" });
    expect(within(dialog).getByText("Donating is completely optional. If you want to support the project, we will open PayPal in your browser.")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(openUrl).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Before opening PayPal" })).not.toBeInTheDocument();
  });
});
