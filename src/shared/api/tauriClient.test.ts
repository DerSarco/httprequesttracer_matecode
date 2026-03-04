import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCapturedRequests,
  confirmAppExit,
  configureInterception,
  decideInterceptRequest,
  getAdbStatus,
  getCapturedRequests,
  getInterceptionState,
  getSessionState,
  prepareCertificateInstall,
  startTracing,
  stopTracing,
} from "./tauriClient";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("tauriClient", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("calls the expected tauri commands", async () => {
    await getAdbStatus();
    await getSessionState();
    await getCapturedRequests();
    await clearCapturedRequests();
    await getInterceptionState();
    await configureInterception({ enabled: true, timeoutMs: 4000, rules: [] });
    await decideInterceptRequest({ requestId: 7, action: "drop" });
    await prepareCertificateInstall("emulator-5554");
    await startTracing({ emulatorSerial: "emulator-5554", proxyHost: "10.0.2.2", proxyPort: 8877 });
    await stopTracing();
    await confirmAppExit();

    expect(vi.mocked(invoke).mock.calls).toEqual([
      ["get_adb_status"],
      ["get_session_state"],
      ["get_captured_requests"],
      ["clear_captured_requests"],
      ["get_interception_state"],
      ["configure_interception", { config: { enabled: true, timeoutMs: 4000, rules: [] } }],
      ["decide_intercept_request", { decision: { requestId: 7, action: "drop" } }],
      ["prepare_certificate_install", { emulatorSerial: "emulator-5554" }],
      ["start_tracing", { emulatorSerial: "emulator-5554", proxyHost: "10.0.2.2", proxyPort: 8877 }],
      ["stop_tracing"],
      ["confirm_app_exit"],
    ]);
  });
});
