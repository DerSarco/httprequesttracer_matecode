import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

describe("tauriClient", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("calls each Tauri command with the expected payload", async () => {
    invokeMock.mockResolvedValue({ ok: true });

    const client = await import("./tauriClient");

    await client.getAdbStatus();
    await client.getSessionState();
    await client.getCapturedRequests();
    await client.clearCapturedRequests();
    await client.getInterceptionState();
    await client.configureInterception({ enabled: true, timeoutMs: 2000, rules: [] });
    await client.decideInterceptRequest({ requestId: 1, action: "drop" });
    await client.prepareCertificateInstall("emulator-5554");
    await client.startTracing({ emulatorSerial: "emulator-5554", proxyHost: "10.0.2.2", proxyPort: 8877 });
    await client.stopTracing();
    await client.confirmAppExit();

    expect(invokeMock.mock.calls).toEqual([
      ["get_adb_status"],
      ["get_session_state"],
      ["get_captured_requests"],
      ["clear_captured_requests"],
      ["get_interception_state"],
      ["configure_interception", { config: { enabled: true, timeoutMs: 2000, rules: [] } }],
      ["decide_intercept_request", { decision: { requestId: 1, action: "drop" } }],
      ["prepare_certificate_install", { emulatorSerial: "emulator-5554" }],
      ["start_tracing", { emulatorSerial: "emulator-5554", proxyHost: "10.0.2.2", proxyPort: 8877 }],
      ["stop_tracing"],
      ["confirm_app_exit"],
    ]);
  });
});
