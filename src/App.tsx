import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type EmulatorDevice = {
  serial: string;
};

type AdbStatus = {
  adbAvailable: boolean;
  adbPath: string | null;
  adbVersion: string | null;
  emulators: EmulatorDevice[];
  message: string | null;
};

type TraceSessionSnapshot = {
  active: boolean;
  emulatorSerial: string | null;
  proxyAddress: string | null;
  startedAtUnixMs: number | null;
  caCertificatePath: string | null;
  lastError: string | null;
};

type HeaderEntry = {
  name: string;
  value: string;
};

type CapturedExchange = {
  id: number;
  startedAtUnixMs: number;
  durationMs: number;
  method: string;
  url: string;
  host: string;
  path: string;
  statusCode: number;
  requestHeaders: HeaderEntry[];
  responseHeaders: HeaderEntry[];
};

type CertificateSetupResult = {
  certLocalPath: string;
  certEmulatorPath: string;
  installerLaunched: boolean;
  instructions: string;
};

const DEFAULT_PROXY_HOST = "10.0.2.2";
const DEFAULT_PROXY_PORT = "8877";

function formatStartTime(unixMs: number | null): string {
  if (!unixMs) return "-";
  return new Date(unixMs).toLocaleString();
}

function formatRequestTimestamp(unixMs: number): string {
  return new Date(unixMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function toUserError(error: unknown): string {
  const raw = String(error ?? "").replace(/^Error:\s*/i, "").trim();
  if (!raw) return "Ocurrió un error inesperado.";

  if (raw.includes("adb not found")) {
    return "No se encontró adb. Instala Android platform-tools o define ADB_PATH con la ruta del binario.";
  }
  if (raw.includes("offline")) {
    return `${raw} Sugerencia: ejecuta \`adb reconnect offline\` y espera a que el emulador aparezca como \`device\`.`;
  }
  if (raw.includes("Failed to bind local proxy") || raw.includes("address already in use")) {
    return `${raw} Sugerencia: cambia el puerto de proxy en la UI y vuelve a intentar.`;
  }
  if (raw.includes("cannot connect to daemon")) {
    return `${raw} Sugerencia: ejecuta \`adb start-server\` y luego Refresh.`;
  }

  return raw;
}

export { DEFAULT_PROXY_HOST, DEFAULT_PROXY_PORT, formatStartTime, formatRequestTimestamp, toUserError };

function App() {
  const [adbStatus, setAdbStatus] = useState<AdbStatus | null>(null);
  const [session, setSession] = useState<TraceSessionSnapshot | null>(null);
  const [capturedRequests, setCapturedRequests] = useState<CapturedExchange[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);

  const [selectedEmulator, setSelectedEmulator] = useState("");
  const [proxyHost, setProxyHost] = useState(DEFAULT_PROXY_HOST);
  const [proxyPort, setProxyPort] = useState(DEFAULT_PROXY_PORT);

  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string | null>(null);
  const [certInfoText, setCertInfoText] = useState<string | null>(null);

  const emulatorOptions = adbStatus?.emulators ?? [];
  const numericPort = Number(proxyPort);
  const canStart = useMemo(
    () =>
      Boolean(adbStatus?.adbAvailable) &&
      emulatorOptions.length > 0 &&
      selectedEmulator.trim().length > 0 &&
      Number.isInteger(numericPort) &&
      numericPort > 0 &&
      numericPort <= 65535 &&
      !session?.active,
    [
      adbStatus?.adbAvailable,
      emulatorOptions.length,
      numericPort,
      selectedEmulator,
      session?.active,
    ]
  );

  const selectedRequest = useMemo(
    () => capturedRequests.find((request) => request.id === selectedRequestId) ?? null,
    [capturedRequests, selectedRequestId]
  );

  async function loadSessionAndAdb() {
    const [nextAdbStatus, nextSession] = await Promise.all([
      invoke<AdbStatus>("get_adb_status"),
      invoke<TraceSessionSnapshot>("get_session_state"),
    ]);

    setAdbStatus(nextAdbStatus);
    setSession(nextSession);

    if (nextSession.emulatorSerial) {
      setSelectedEmulator(nextSession.emulatorSerial);
      return;
    }

    if (!selectedEmulator && nextAdbStatus.emulators.length > 0) {
      setSelectedEmulator(nextAdbStatus.emulators[0].serial);
    }
  }

  async function loadCapturedRequests() {
    const requests = await invoke<CapturedExchange[]>("get_captured_requests");
    setCapturedRequests((previous) => {
      const previousLastId = previous[previous.length - 1]?.id;
      const nextLastId = requests[requests.length - 1]?.id;
      const previousCount = previous.length;
      const nextCount = requests.length;

      if (previousCount === nextCount && previousLastId === nextLastId) {
        return previous;
      }

      return requests;
    });

    setSelectedRequestId((current) => {
      if (!current && requests.length > 0) {
        return requests[requests.length - 1].id;
      }
      if (current && !requests.some((request) => request.id === current)) {
        return requests.length > 0 ? requests[requests.length - 1].id : null;
      }
      return current;
    });
  }

  async function handleRefresh() {
    setBusy(true);
    setErrorText(null);
    setInfoText("Actualizando estado...");
    try {
      await Promise.all([loadSessionAndAdb(), loadCapturedRequests()]);
      setInfoText("Estado actualizado.");
    } catch (error) {
      setErrorText(toUserError(error));
      setInfoText(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleStartTracing() {
    if (!selectedEmulator) {
      setErrorText("Selecciona un emulador para iniciar tracing.");
      return;
    }

    setBusy(true);
    setErrorText(null);
    setInfoText("Iniciando tracing...");

    try {
      const nextSession = await invoke<TraceSessionSnapshot>("start_tracing", {
        emulatorSerial: selectedEmulator,
        proxyHost,
        proxyPort: Number(proxyPort),
      });
      setSession(nextSession);
      setInfoText("Tracing iniciado. Proxy local y MITM activos.");
    } catch (error) {
      setErrorText(toUserError(error));
      setInfoText(null);
      await loadSessionAndAdb().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function handleStopTracing() {
    setBusy(true);
    setErrorText(null);
    setInfoText("Deteniendo tracing...");

    try {
      const nextSession = await invoke<TraceSessionSnapshot>("stop_tracing");
      setSession(nextSession);
      setInfoText("Tracing detenido. Proxy removido del emulador.");
    } catch (error) {
      setErrorText(toUserError(error));
      setInfoText(null);
    } finally {
      setBusy(false);
    }
  }

  async function handlePrepareCertificate() {
    if (!selectedEmulator) {
      setErrorText("Selecciona un emulador para preparar el certificado.");
      return;
    }

    setBusy(true);
    setErrorText(null);
    setInfoText("Preparando certificado...");
    setCertInfoText(null);
    try {
      const result = await invoke<CertificateSetupResult>("prepare_certificate_install", {
        emulatorSerial: selectedEmulator,
      });
      setCertInfoText(
        `${result.instructions} Archivo local: ${result.certLocalPath}. Archivo en emulador: ${result.certEmulatorPath}.`
      );
      await loadSessionAndAdb();
    } catch (error) {
      setErrorText(toUserError(error));
      setInfoText(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleClearCapturedRequests() {
    setBusy(true);
    setErrorText(null);
    try {
      await invoke("clear_captured_requests");
      setCapturedRequests([]);
      setSelectedRequestId(null);
      setInfoText("Sesion de requests limpiada.");
    } catch (error) {
      setErrorText(toUserError(error));
      setInfoText(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    handleRefresh();
  }, []);

  useEffect(() => {
    if (!session?.active) return;

    const intervalId = window.setInterval(() => {
      loadCapturedRequests().catch(() => {
        // Polling should not break the UI interaction loop.
      });
    }, 800);

    return () => window.clearInterval(intervalId);
  }, [session?.active]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">HTTP Request Tracer</p>
        <h1>Android Emulator Proxy Console</h1>
        <p className="subhead">
          Spike activo: MITM HTTPS local, instalacion de CA en emulador y captura de requests.
        </p>
      </header>

      <section className="panel control-panel">
        <div className="input-grid">
          <label>
            Emulador
            <select
              value={selectedEmulator}
              onChange={(event) => setSelectedEmulator(event.target.value)}
              disabled={busy || session?.active}
            >
              {emulatorOptions.length === 0 && (
                <option value="">Sin emuladores disponibles</option>
              )}
              {emulatorOptions.map((emulator) => (
                <option key={emulator.serial} value={emulator.serial}>
                  {emulator.serial}
                </option>
              ))}
            </select>
          </label>

          <label>
            Proxy host (emulador)
            <input
              value={proxyHost}
              onChange={(event) => setProxyHost(event.target.value)}
              disabled={busy || session?.active}
            />
          </label>

          <label>
            Proxy port
            <input
              value={proxyPort}
              onChange={(event) => setProxyPort(event.target.value.replace(/[^\d]/g, ""))}
              disabled={busy || session?.active}
            />
          </label>
        </div>

        <div className="actions">
          <button onClick={handleRefresh} disabled={busy}>
            Refresh
          </button>
          <button onClick={handlePrepareCertificate} disabled={busy || session?.active || !selectedEmulator}>
            Prepare CA Install
          </button>
          <button className="primary" onClick={handleStartTracing} disabled={busy || !canStart}>
            Start Tracing
          </button>
          <button className="danger" onClick={handleStopTracing} disabled={busy || !session?.active}>
            Stop Tracing
          </button>
        </div>
      </section>

      {(errorText || infoText || certInfoText || session?.lastError || adbStatus?.message) && (
        <section className="panel notice-panel">
          {errorText && <p className="notice error">{errorText}</p>}
          {session?.lastError && <p className="notice error">{session.lastError}</p>}
          {adbStatus?.message && <p className="notice warning">{adbStatus.message}</p>}
          {infoText && <p className="notice info">{infoText}</p>}
          {certInfoText && <p className="notice info">{certInfoText}</p>}
        </section>
      )}

      <section className="panel-grid">
        <article className="panel">
          <h2>ADB & Emuladores</h2>
          <ul className="metrics">
            <li>
              <span>ADB disponible</span>
              <strong>{adbStatus?.adbAvailable ? "Si" : "No"}</strong>
            </li>
            <li>
              <span>Version ADB</span>
              <strong>{adbStatus?.adbVersion ?? "-"}</strong>
            </li>
            <li>
              <span>Ruta ADB</span>
              <strong className="mono">{adbStatus?.adbPath ?? "-"}</strong>
            </li>
            <li>
              <span>Emuladores conectados</span>
              <strong>{emulatorOptions.length}</strong>
            </li>
          </ul>
        </article>

        <article className="panel">
          <h2>Sesion de tracing</h2>
          <ul className="metrics">
            <li>
              <span>Estado</span>
              <strong>{session?.active ? "Activo" : "Detenido"}</strong>
            </li>
            <li>
              <span>Emulador activo</span>
              <strong>{session?.emulatorSerial ?? "-"}</strong>
            </li>
            <li>
              <span>Proxy aplicado</span>
              <strong>{session?.proxyAddress ?? "-"}</strong>
            </li>
            <li>
              <span>CA local</span>
              <strong className="mono">{session?.caCertificatePath ?? "-"}</strong>
            </li>
            <li>
              <span>Iniciado en</span>
              <strong>{formatStartTime(session?.startedAtUnixMs ?? null)}</strong>
            </li>
          </ul>
        </article>
      </section>

      <section className="panel traffic-panel">
        <div className="traffic-header">
          <h2>Requests capturadas ({capturedRequests.length})</h2>
          <button onClick={handleClearCapturedRequests} disabled={busy || capturedRequests.length === 0}>
            Clear Session
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Method</th>
                <th>Host</th>
                <th>Path</th>
                <th>Status</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {capturedRequests.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    Sin trafico capturado aun.
                  </td>
                </tr>
              )}
              {capturedRequests.map((request) => (
                <tr
                  key={request.id}
                  className={request.id === selectedRequestId ? "selected" : ""}
                  onClick={() => setSelectedRequestId(request.id)}
                >
                  <td>{formatRequestTimestamp(request.startedAtUnixMs)}</td>
                  <td>{request.method}</td>
                  <td>{request.host || "-"}</td>
                  <td className="mono">{request.path}</td>
                  <td>{request.statusCode}</td>
                  <td>{request.durationMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel details-panel">
        <h2>Detalle de request</h2>
        {!selectedRequest && <p className="muted">Selecciona una request para ver headers y metadata.</p>}
        {selectedRequest && (
          <>
            <ul className="metrics">
              <li>
                <span>URL</span>
                <strong className="mono">{selectedRequest.url}</strong>
              </li>
              <li>
                <span>Timestamp</span>
                <strong>{formatRequestTimestamp(selectedRequest.startedAtUnixMs)}</strong>
              </li>
              <li>
                <span>Status</span>
                <strong>{selectedRequest.statusCode}</strong>
              </li>
              <li>
                <span>Duracion</span>
                <strong>{selectedRequest.durationMs} ms</strong>
              </li>
            </ul>

            <div className="headers-grid">
              <div>
                <h3>Request headers</h3>
                <ul className="header-list">
                  {selectedRequest.requestHeaders.map((header, index) => (
                    <li key={`${header.name}-${index}`}>
                      <span>{header.name}</span>
                      <code>{header.value}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Response headers</h3>
                <ul className="header-list">
                  {selectedRequest.responseHeaders.map((header, index) => (
                    <li key={`${header.name}-${index}`}>
                      <span>{header.name}</span>
                      <code>{header.value}</code>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default App;
