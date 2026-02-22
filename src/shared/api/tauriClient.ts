import { invoke } from "@tauri-apps/api/core";
import type {
  AdbStatus,
  CapturedExchange,
  CertificateSetupResult,
  InterceptDecisionInput,
  InterceptionConfigInput,
  InterceptionSnapshot,
  TraceSessionSnapshot,
} from "../contracts";

export async function getAdbStatus(): Promise<AdbStatus> {
  return invoke<AdbStatus>("get_adb_status");
}

export async function getSessionState(): Promise<TraceSessionSnapshot> {
  return invoke<TraceSessionSnapshot>("get_session_state");
}

export async function getCapturedRequests(): Promise<CapturedExchange[]> {
  return invoke<CapturedExchange[]>("get_captured_requests");
}

export async function clearCapturedRequests(): Promise<void> {
  return invoke("clear_captured_requests");
}

export async function getInterceptionState(): Promise<InterceptionSnapshot> {
  return invoke<InterceptionSnapshot>("get_interception_state");
}

export async function configureInterception(config: InterceptionConfigInput): Promise<InterceptionSnapshot> {
  return invoke<InterceptionSnapshot>("configure_interception", { config });
}

export async function decideInterceptRequest(decision: InterceptDecisionInput): Promise<InterceptionSnapshot> {
  return invoke<InterceptionSnapshot>("decide_intercept_request", { decision });
}

export async function prepareCertificateInstall(emulatorSerial: string): Promise<CertificateSetupResult> {
  return invoke<CertificateSetupResult>("prepare_certificate_install", { emulatorSerial });
}

export async function startTracing(payload: {
  emulatorSerial: string;
  proxyHost: string;
  proxyPort: number;
}): Promise<TraceSessionSnapshot> {
  return invoke<TraceSessionSnapshot>("start_tracing", payload);
}

export async function stopTracing(): Promise<TraceSessionSnapshot> {
  return invoke<TraceSessionSnapshot>("stop_tracing");
}

export async function confirmAppExit(): Promise<void> {
  return invoke("confirm_app_exit");
}
