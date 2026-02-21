import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App, { formatRequestTimestamp, formatStartTime, toUserError } from "./App";
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
  requestBody: string | null;
  responseBody: string | null;
  requestBodySize: number;
  responseBodySize: number;
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
        requestBody: "{\"hello\":\"world\"}",
        responseBody: "{\"ok\":true}",
        requestBodySize: 17,
        responseBodySize: 11,
      },
    ];

    render(<App />);

    expect(await screen.findByText("Estado actualizado.")).toBeInTheDocument();
    expect(await screen.findByText("https://example.com/api")).toBeInTheDocument();
    expect(screen.getByText("{\"hello\":\"world\"}")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Headers" }));
    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getAllByText("application/json")).toHaveLength(2);
  });

  it("applies combined filters and allows clearing them", async () => {
    currentCapturedRequests = [
      {
        id: 201,
        startedAtUnixMs: 1700000001000,
        durationMs: 120,
        method: "GET",
        url: "https://example.com/api/users?page=1",
        host: "example.com",
        path: "/api/users?page=1",
        statusCode: 200,
        requestHeaders: [{ name: "Accept", value: "application/json" }],
        responseHeaders: [{ name: "Content-Type", value: "application/json" }],
        requestBody: null,
        responseBody: "{\"users\":[]}",
        requestBodySize: 0,
        responseBodySize: 12,
      },
      {
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
      },
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

    await userEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("auth.example.com")).toBeInTheDocument();
  });

  it("clears captured session from UI when clicking Clear Session", async () => {
    currentCapturedRequests = [
      {
        id: 301,
        startedAtUnixMs: 1700000003000,
        durationMs: 90,
        method: "GET",
        url: "https://clear.example.com",
        host: "clear.example.com",
        path: "/",
        statusCode: 200,
        requestHeaders: [],
        responseHeaders: [],
        requestBody: null,
        responseBody: "{\"ok\":true}",
        requestBodySize: 0,
        responseBodySize: 11,
      },
    ];

    render(<App />);
    expect(await screen.findByText("Estado actualizado.")).toBeInTheDocument();
    expect(screen.getByText("clear.example.com")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear Session" }));

    expect(await screen.findByText("Sesion de requests limpiada.")).toBeInTheDocument();
    expect(screen.queryByText("clear.example.com")).not.toBeInTheDocument();
    expect(screen.getByText("Sin trafico capturado aun.")).toBeInTheDocument();
  });
});
