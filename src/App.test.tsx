import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App, { formatStartTime, toUserError } from "./App";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

type InvokeMock = typeof invoke & { mockImplementation: (fn: (cmd: string) => Promise<unknown>) => void };

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
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
}> = [];

const invokeMock = invoke as InvokeMock;

beforeEach(() => {
  currentCapturedRequests = [];
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "get_adb_status":
        return adbStatus;
      case "get_session_state":
        return sessionInactive;
      case "get_captured_requests":
        return currentCapturedRequests;
      case "start_tracing":
        return sessionActive;
      case "stop_tracing":
        return sessionInactive;
      case "prepare_certificate_install":
        return {
          certLocalPath: "/tmp/ca.pem",
          certEmulatorPath: "/sdcard/ca.pem",
          installerLaunched: false,
          instructions: "Abre la app de certificados e instala el CA.",
        };
      case "clear_captured_requests":
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

  it("normalizes errors for users", () => {
    expect(toUserError(null)).toBe("Ocurrió un error inesperado.");
    expect(toUserError(new Error("adb not found"))).toContain("No se encontró adb");
    expect(toUserError(new Error("offline"))).toContain("adb reconnect offline");
    expect(toUserError(new Error("Failed to bind local proxy"))).toContain("cambia el puerto de proxy");
    expect(toUserError(new Error("cannot connect to daemon"))).toContain("adb start-server");
    expect(toUserError(new Error("algo"))).toBe("algo");
  });
});

describe("App", () => {
  it("loads ADB/session data and enables tracing actions", async () => {
    render(<App />);

    expect(await screen.findByText("Estado actualizado.")).toBeInTheDocument();

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

  it("renders captured request details when data exists", async () => {
    currentCapturedRequests = [
      {
        id: 101,
        startedAtUnixMs: 1700000001000,
        durationMs: 245,
        method: "GET",
        url: "https://example.com/api",
        host: "example.com",
        path: "/api",
        statusCode: 200,
        requestHeaders: [{ name: "Accept", value: "application/json" }],
        responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      },
    ];

    render(<App />);

    expect(await screen.findByText("Estado actualizado.")).toBeInTheDocument();
    expect(await screen.findByText("https://example.com/api")).toBeInTheDocument();
    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getAllByText("application/json")).toHaveLength(2);
  });
});
