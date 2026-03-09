import { useEffect, useMemo, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
} from "./shared/api/tauriClient";
import { DEFAULT_PROXY_HOST, DEFAULT_PROXY_PORT, DETAIL_TABS, type DetailTab } from "./shared/config";
import type {
  AdbStatus,
  CapturedExchange,
  FontScale,
  InterceptDecisionInput,
  InterceptionConfigInput,
  InterceptionRule,
  InterceptionSnapshot,
  Language,
  OperationalState,
  SortDirection,
  SortField,
  ThemeMode,
  TraceSessionSnapshot,
  UserPreferences,
  WorkspaceTab,
} from "./shared/contracts";
import { LOCALES } from "./shared/i18n/locales";
import { loadPreferences, persistPreferences } from "./shared/preferences";
import { copyToClipboard } from "./shared/utils/clipboard";
import {
  buildCurlCommand,
  createEmptyRule,
  createRuleId,
  formatByteSize,
  formatHeadersAsText,
  formatRequestTimestamp,
  formatStartTime,
  getHeaderValue,
  isSensitiveHeader,
  maskSensitiveValue,
  matchesStatusFilter,
  parseCookieEntries,
  parseHeaderLines,
  parseParamEntries,
  toUserError,
} from "./shared/utils/requestHelpers";
import "./App.css";

export { DEFAULT_PROXY_HOST, DEFAULT_PROXY_PORT } from "./shared/config";
export { formatRequestTimestamp, formatStartTime, toUserError } from "./shared/utils/requestHelpers";

function App() {
  const [preferences, setPreferences] = useState<UserPreferences>(() => loadPreferences());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const texts = LOCALES[preferences.language];

  const [adbStatus, setAdbStatus] = useState<AdbStatus | null>(null);
  const [session, setSession] = useState<TraceSessionSnapshot | null>(null);
  const [interception, setInterception] = useState<InterceptionSnapshot | null>(null);

  const [capturedRequests, setCapturedRequests] = useState<CapturedExchange[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("request");
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("requests");

  const [searchFilter, setSearchFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("id");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [selectedEmulator, setSelectedEmulator] = useState("");
  const [proxyHost, setProxyHost] = useState(DEFAULT_PROXY_HOST);
  const [proxyPort, setProxyPort] = useState(DEFAULT_PROXY_PORT);

  const [busy, setBusy] = useState(false);
  const [interceptBusy, setInterceptBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string | null>(null);
  const [certInfoText, setCertInfoText] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [certInstallModalOpen, setCertInstallModalOpen] = useState(false);
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const exitBusyRef = useRef(false);
  const previousPendingIdsRef = useRef<number[]>([]);

  const [interceptTimeoutInput, setInterceptTimeoutInput] = useState("12000");
  const [interceptRulesInput, setInterceptRulesInput] = useState<InterceptionRule[]>([]);
  const [selectedPendingId, setSelectedPendingId] = useState<number | null>(null);
  const [editorMethod, setEditorMethod] = useState("");
  const [editorUrl, setEditorUrl] = useState("");
  const [editorHeaders, setEditorHeaders] = useState("");
  const [editorBody, setEditorBody] = useState("");
  const [editorQuery, setEditorQuery] = useState("");
  const [editorCookies, setEditorCookies] = useState("");

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
    [adbStatus?.adbAvailable, emulatorOptions.length, numericPort, selectedEmulator, session?.active],
  );

  const availableMethods = useMemo(
    () => [...new Set(capturedRequests.map((request) => request.method).filter(Boolean))].sort(),
    [capturedRequests],
  );
  const availableInterceptionMethods = useMemo(
    () =>
      ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", ...availableMethods]
        .filter((value, index, list) => list.indexOf(value) === index),
    [availableMethods],
  );

  const filteredRequests = useMemo(() => {
    const normalizedSearch = searchFilter.trim().toLowerCase();

    return capturedRequests.filter((request) => {
      const matchesText =
        !normalizedSearch ||
        request.host.toLowerCase().includes(normalizedSearch) ||
        request.path.toLowerCase().includes(normalizedSearch);
      const matchesMethod = methodFilter === "all" || request.method === methodFilter;
      const matchesStatus = matchesStatusFilter(request.statusCode, statusFilter);
      return matchesText && matchesMethod && matchesStatus;
    });
  }, [capturedRequests, methodFilter, searchFilter, statusFilter]);

  const visibleRequests = useMemo(() => {
    const next = [...filteredRequests];
    next.sort((a, b) => {
      const left = sortField === "id" ? a.id : a.startedAtUnixMs;
      const right = sortField === "id" ? b.id : b.startedAtUnixMs;
      return sortDirection === "asc" ? left - right : right - left;
    });
    return next;
  }, [filteredRequests, sortDirection, sortField]);

  const selectedRequest = useMemo(
    () => visibleRequests.find((request) => request.id === selectedRequestId) ?? null,
    [visibleRequests, selectedRequestId],
  );

  const parsedCookies = useMemo(() => (selectedRequest ? parseCookieEntries(selectedRequest) : []), [selectedRequest]);
  const parsedParams = useMemo(() => (selectedRequest ? parseParamEntries(selectedRequest) : []), [selectedRequest]);

  const pendingIntercepts = interception?.pendingRequests ?? [];
  const selectedPending = useMemo(
    () => pendingIntercepts.find((request) => request.id === selectedPendingId) ?? null,
    [pendingIntercepts, selectedPendingId],
  );

  const operationalStates = useMemo<OperationalState[]>(() => {
    const states: OperationalState[] = [];

    if (!adbStatus?.adbAvailable) {
      states.push({
        key: "adb-missing",
        level: "error",
        title: texts.adbMissing,
        description: texts.adbMissingDesc,
        action: texts.adbMissingAction,
      });
    }

    if (adbStatus?.adbAvailable && emulatorOptions.length === 0) {
      states.push({
        key: "no-emulator",
        level: "warn",
        title: texts.noEmulator,
        description: texts.noEmulatorDesc,
        action: texts.noEmulatorAction,
      });
    }

    if (!preferences.certTrusted) {
      states.push({
        key: "cert-not-trusted",
        level: "warn",
        title: texts.certNotTrusted,
        description: texts.certNotTrustedDesc,
        action: texts.certNotTrustedAction,
      });
    }

    if (session?.active) {
      states.push({
        key: "tracing-active",
        level: "ok",
        title: texts.tracingActive,
        description: texts.tracingActiveDesc,
        action: texts.tracingActiveAction,
      });
    }

    if (states.length === 0) {
      states.push({
        key: "ready",
        level: "ok",
        title: texts.ready,
        description: texts.readyDesc,
        action: texts.readyAction,
      });
    }

    return states;
  }, [adbStatus?.adbAvailable, emulatorOptions.length, preferences.certTrusted, session?.active, texts]);

  const hasActiveFilters =
    searchFilter.trim().length > 0 || methodFilter !== "all" || statusFilter.trim().length > 0;

  function updatePreferences(patch: Partial<UserPreferences>) {
    setPreferences((previous) => {
      const next = { ...previous, ...patch };
      persistPreferences(next);
      return next;
    });
  }

  async function loadInterceptionState(syncInputs = true) {
    try {
      const snapshot = await getInterceptionState();
      setInterception(snapshot);
      if (syncInputs) {
        setInterceptTimeoutInput(String(snapshot.timeoutMs));
        setInterceptRulesInput(
          snapshot.rules.map((rule) => ({
            ...rule,
            id: rule.id || createRuleId(),
          })),
        );
      }
      setSelectedPendingId((current) => {
        if (snapshot.pendingRequests.length === 0) return null;
        if (current && snapshot.pendingRequests.some((request) => request.id === current)) {
          return current;
        }
        return snapshot.pendingRequests[0].id;
      });
    } catch {
      setInterception(null);
    }
  }

  async function loadSessionAndAdb() {
    const [nextAdbStatus, nextSession] = await Promise.all([
      getAdbStatus(),
      getSessionState(),
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
    const requests = await getCapturedRequests();
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
  }

  async function handleRefresh() {
    setBusy(true);
    setErrorText(null);
    setInfoText("Actualizando estado...");
    try {
      await Promise.all([loadSessionAndAdb(), loadCapturedRequests(), loadInterceptionState()]);
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
      const nextSession = await startTracing({
        emulatorSerial: selectedEmulator,
        proxyHost,
        proxyPort: Number(proxyPort),
      });
      setSession(nextSession);
      setInfoText("Tracing iniciado. Proxy local y MITM activos.");
      await loadInterceptionState();
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
      const nextSession = await stopTracing();
      setSession(nextSession);
      setInfoText("Tracing detenido. Proxy removido del emulador.");
      await loadInterceptionState();
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

    setErrorText(null);
    setCertInstallModalOpen(true);
  }

  async function runPrepareCertificateInstall() {
    if (!selectedEmulator) {
      setErrorText("Selecciona un emulador para preparar el certificado.");
      return;
    }

    setCertInstallModalOpen(false);
    setBusy(true);
    setErrorText(null);
    setInfoText(texts.certInstallPreparing);
    setCertInfoText(null);

    try {
      const result = await prepareCertificateInstall(selectedEmulator);
      setCertInfoText(
        `${result.instructions} Verificacion: ${result.verificationNote} Archivo local: ${result.certLocalPath}. Archivo en emulador: ${result.certEmulatorPath}.`,
      );
      if (result.installationStatus === "pendingUserAction") {
        setInfoText("Certificado copiado. Completa la confirmacion en el emulador.");
        updatePreferences({ certTrusted: false });
      } else {
        setInfoText("No fue posible preparar la instalacion manual del certificado.");
        updatePreferences({ certTrusted: false });
      }
      await loadSessionAndAdb();
    } catch (error) {
      setErrorText(toUserError(error));
      setInfoText(null);
    } finally {
      setBusy(false);
    }
  }

  function handleCancelExit() {
    if (exitBusy) return;
    setExitModalOpen(false);
  }

  async function handleConfirmExit() {
    if (exitBusy) return;

    setExitBusy(true);
    setErrorText(null);
    setInfoText(texts.exitPromptClosing);

    try {
      await confirmAppExit();
    } catch (error) {
      setExitBusy(false);
      setExitModalOpen(false);
      setInfoText(null);
      setErrorText(toUserError(error));
    }
  }

  async function handleClearCapturedRequests() {
    setBusy(true);
    setErrorText(null);
    try {
      await clearCapturedRequests();
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

  function handleAddInterceptionRule() {
    setInterceptRulesInput((previous) => [...previous, createEmptyRule()]);
  }

  function handleRemoveInterceptionRule(ruleId: string) {
    setInterceptRulesInput((previous) => previous.filter((rule) => rule.id !== ruleId));
  }

  function handleUpdateInterceptionRule(ruleId: string, patch: Partial<InterceptionRule>) {
    setInterceptRulesInput((previous) =>
      previous.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)),
    );
  }

  async function handleApplyInterceptionConfig(enabled: boolean) {
    setInterceptBusy(true);
    setErrorText(null);

    const timeoutMs = Number(interceptTimeoutInput);
    const sanitizedRules = interceptRulesInput
      .map((rule) => ({
        ...rule,
        hostContains: rule.hostContains.trim(),
        pathContains: rule.pathContains.trim(),
        method: rule.method.trim().toUpperCase(),
      }))
      .filter((rule) => Boolean(rule.hostContains || rule.pathContains || rule.method))
      .slice(0, 64);

    const payload: InterceptionConfigInput = {
      enabled,
      timeoutMs: Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(timeoutMs, 120000)) : 12000,
      rules: sanitizedRules,
    };

    try {
      const snapshot = await configureInterception(payload);
      setInterception(snapshot);
      setInterceptTimeoutInput(String(snapshot.timeoutMs));
      setInterceptRulesInput(
        snapshot.rules.map((rule) => ({
          ...rule,
          id: rule.id || createRuleId(),
        })),
      );
      setInfoText("Configuracion de interceptacion actualizada.");
    } catch (error) {
      setErrorText(toUserError(error));
    } finally {
      setInterceptBusy(false);
    }
  }

  async function handleInterceptDecision(action: "forward" | "drop") {
    if (!selectedPending) return;

    setInterceptBusy(true);
    setErrorText(null);

    const decision: InterceptDecisionInput = {
      requestId: selectedPending.id,
      action,
    };

    if (action === "forward") {
      decision.method = editorMethod.trim() || undefined;
      decision.url = editorUrl.trim() || undefined;
      decision.headers = parseHeaderLines(editorHeaders);
      decision.body = editorBody;
      decision.query = editorQuery.trim();
      decision.cookies = editorCookies.trim();
    }

    try {
      const snapshot = await decideInterceptRequest(decision);
      setInterception(snapshot);
      setInfoText(action === "drop" ? "Request interceptada descartada." : "Request interceptada reenviada.");
    } catch (error) {
      setErrorText(toUserError(error));
    } finally {
      setInterceptBusy(false);
    }
  }

  async function handleCopy(content: string) {
    try {
      await copyToClipboard(content);
      setCopyFeedback(texts.copied);
    } catch {
      setCopyFeedback(texts.copyFailed);
    }
  }

  async function handleExportCurl() {
    if (!selectedRequest) return;
    const command = buildCurlCommand(selectedRequest, preferences.showSensitiveData);
    await handleCopy(command);
  }

  function clearFilters() {
    setSearchFilter("");
    setMethodFilter("all");
    setStatusFilter("");
  }

  useEffect(() => {
    handleRefresh();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", preferences.theme);
  }, [preferences.theme]);

  useEffect(() => {
    exitBusyRef.current = exitBusy;
  }, [exitBusy]);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen("httptracer://exit-requested", () => {
      setExitBusy(false);
      setExitModalOpen(true);
    })
      .then((dispose) => {
        unlisten = dispose;
      })
      .catch(() => {
        // App exit confirmation listener is best-effort.
      });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  useEffect(() => {
    let unlistenWindowClose: UnlistenFn | null = null;

    try {
      getCurrentWindow()
        .onCloseRequested((event) => {
          if (exitBusyRef.current) {
            return;
          }

          event.preventDefault();
          setExitBusy(false);
          setExitModalOpen(true);
        })
        .then((dispose) => {
          unlistenWindowClose = dispose;
        })
        .catch(() => {
          // Close interception is best-effort.
        });
    } catch {
      // getCurrentWindow can throw in non-Tauri environments (e.g. unit tests).
    }

    return () => {
      if (unlistenWindowClose) {
        unlistenWindowClose();
      }
    };
  }, []);

  useEffect(() => {
    if (!rulesModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRulesModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [rulesModalOpen]);

  useEffect(() => {
    if (!exitModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !exitBusy) {
        setExitModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [exitModalOpen, exitBusy]);

  useEffect(() => {
    if (!session?.active) return;

    const intervalId = window.setInterval(() => {
      Promise.all([loadCapturedRequests(), loadInterceptionState(false)]).catch(() => {
        // Polling should not break the UI interaction loop.
      });
    }, 800);

    return () => window.clearInterval(intervalId);
  }, [session?.active]);

  useEffect(() => {
    setSelectedRequestId((current) => {
      if (visibleRequests.length === 0) return null;
      if (current && visibleRequests.some((request) => request.id === current)) {
        return current;
      }
      return visibleRequests[0].id;
    });
  }, [visibleRequests]);

  useEffect(() => {
    if (!selectedPending) return;

    setEditorMethod(selectedPending.method);
    setEditorUrl(selectedPending.url);
    setEditorHeaders(formatHeadersAsText(selectedPending.headers, true));
    setEditorBody(selectedPending.body ?? "");

    try {
      const url = new URL(selectedPending.url);
      setEditorQuery(url.search ? url.search.slice(1) : "");
    } catch {
      const queryRaw = selectedPending.path.includes("?")
        ? selectedPending.path.slice(selectedPending.path.indexOf("?") + 1)
        : "";
      setEditorQuery(queryRaw);
    }

    setEditorCookies(getHeaderValue(selectedPending.headers, "cookie") ?? "");
  }, [selectedPending?.id]);

  useEffect(() => {
    const pendingIds = pendingIntercepts.map((request) => request.id);
    const hasNewPendingRequest = pendingIds.some((id) => !previousPendingIdsRef.current.includes(id));

    if (hasNewPendingRequest && activeWorkspaceTab !== "interception") {
      setActiveWorkspaceTab("interception");
    }

    previousPendingIdsRef.current = pendingIds;
  }, [activeWorkspaceTab, pendingIntercepts]);

  useEffect(() => {
    if (!copyFeedback) return;
    const timeout = window.setTimeout(() => setCopyFeedback(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [copyFeedback]);

  const requestTabCopyContent = selectedRequest
    ? selectedRequest.requestBody ?? formatHeadersAsText(selectedRequest.requestHeaders, preferences.showSensitiveData)
    : "";

  const responseTabCopyContent = selectedRequest
    ? selectedRequest.responseBody ?? formatHeadersAsText(selectedRequest.responseHeaders, preferences.showSensitiveData)
    : "";

  const requestCountText = `${texts.requestsTitle} (${visibleRequests.length}${
    hasActiveFilters ? ` / ${capturedRequests.length}` : ""
  })`;
  const configuredRuleCount = interception?.rules.length ?? 0;
  const activeRuleCount = interception?.rules.filter((rule) => rule.enabled).length ?? 0;
  const interceptionRulesSummary =
    configuredRuleCount === 0
      ? `0 ${texts.requestsRulesConfigured}`
      : `${activeRuleCount} ${texts.requestsRulesActive} / ${configuredRuleCount} ${texts.requestsRulesConfigured}`;

  return (
    <main className={`app-shell font-${preferences.fontScale}`}>
      <header className="app-header">
        <div className="header-row">
          <div>
            <p className="eyebrow">HTTP Request Tracer</p>
            <h1>{texts.headerTitle}</h1>
            <p className="subhead">{texts.headerSubhead}</p>
          </div>
          <button onClick={() => setSettingsOpen((current) => !current)}>{texts.settings}</button>
        </div>
      </header>

      {settingsOpen && (
        <section className="panel settings-panel">
          <div className="settings-header">
            <h2>{texts.settingsTitle}</h2>
            <button onClick={() => setSettingsOpen(false)}>{texts.closeSettings}</button>
          </div>
          <div className="settings-grid">
            <label>
              {texts.language}
              <select
                value={preferences.language}
                onChange={(event) => updatePreferences({ language: event.target.value as Language })}
              >
                <option value="es">Espanol</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              {texts.theme}
              <select value={preferences.theme} onChange={(event) => updatePreferences({ theme: event.target.value as ThemeMode })}>
                <option value="light">{texts.light}</option>
                <option value="dark">{texts.dark}</option>
              </select>
            </label>
            <label>
              {texts.fontSize}
              <select
                value={preferences.fontScale}
                onChange={(event) => updatePreferences({ fontScale: event.target.value as FontScale })}
              >
                <option value="small">{texts.fontSmall}</option>
                <option value="medium">{texts.fontMedium}</option>
                <option value="large">{texts.fontLarge}</option>
              </select>
            </label>
            <label>
              {texts.sensitiveData}
              <select
                value={preferences.showSensitiveData ? "show" : "hide"}
                onChange={(event) => updatePreferences({ showSensitiveData: event.target.value === "show" })}
              >
                <option value="hide">{texts.hideSensitive}</option>
                <option value="show">{texts.showSensitive}</option>
              </select>
            </label>
            <label>
              {texts.certTrusted}
              <select
                value={preferences.certTrusted ? "trusted" : "pending"}
                onChange={(event) => updatePreferences({ certTrusted: event.target.value === "trusted" })}
              >
                <option value="pending">{texts.markCertPending}</option>
                <option value="trusted">{texts.markCertTrusted}</option>
              </select>
            </label>
          </div>
        </section>
      )}

      <section className="panel control-panel">
        <h2>{texts.controls}</h2>
        <div className="input-grid">
          <label>
            {texts.emulator}
            <select
              value={selectedEmulator}
              onChange={(event) => setSelectedEmulator(event.target.value)}
              disabled={busy || session?.active}
            >
              {emulatorOptions.length === 0 && <option value="">Sin emuladores disponibles</option>}
              {emulatorOptions.map((emulator) => (
                <option key={emulator.serial} value={emulator.serial}>
                  {emulator.serial}
                </option>
              ))}
            </select>
          </label>

          <label>
            {texts.proxyHost}
            <input value={proxyHost} onChange={(event) => setProxyHost(event.target.value)} disabled={busy || session?.active} />
          </label>

          <label>
            {texts.proxyPort}
            <input
              value={proxyPort}
              onChange={(event) => setProxyPort(event.target.value.replace(/[^\d]/g, ""))}
              disabled={busy || session?.active}
            />
          </label>
        </div>

        <div className="actions">
          <button onClick={handleRefresh} disabled={busy}>
            {texts.refresh}
          </button>
          <button onClick={handlePrepareCertificate} disabled={busy || session?.active || !selectedEmulator}>
            {texts.prepareCa}
          </button>
          <button className="primary" onClick={handleStartTracing} disabled={busy || !canStart}>
            {texts.startTracing}
          </button>
          <button className="danger" onClick={handleStopTracing} disabled={busy || !session?.active}>
            {texts.stopTracing}
          </button>
        </div>
      </section>

      {(errorText || infoText || certInfoText || session?.lastError || adbStatus?.message || copyFeedback) && (
        <section className="panel notice-panel">
          {errorText && <p className="notice error">{errorText}</p>}
          {session?.lastError && <p className="notice error">{session.lastError}</p>}
          {adbStatus?.message && <p className="notice warning">{adbStatus.message}</p>}
          {infoText && <p className="notice info">{infoText}</p>}
          {certInfoText && <p className="notice info">{certInfoText}</p>}
          {copyFeedback && <p className="notice info">{copyFeedback}</p>}
        </section>
      )}

      <section className="panel">
        <h2>{texts.operationStatus}</h2>
        <div className="state-grid">
          {operationalStates.map((operationalState) => (
            <article key={operationalState.key} className={`state-card ${operationalState.level}`}>
              <h3>{operationalState.title}</h3>
              <p>{operationalState.description}</p>
              <small>{operationalState.action}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <h2>{texts.adbPanel}</h2>
          <ul className="metrics">
            <li>
              <span>{texts.adbAvailable}</span>
              <strong>{adbStatus?.adbAvailable ? "Si" : "No"}</strong>
            </li>
            <li>
              <span>{texts.adbVersion}</span>
              <strong>{adbStatus?.adbVersion ?? "-"}</strong>
            </li>
            <li>
              <span>{texts.adbPath}</span>
              <strong className="mono">{adbStatus?.adbPath ?? "-"}</strong>
            </li>
            <li>
              <span>{texts.emulatorsConnected}</span>
              <strong>{emulatorOptions.length}</strong>
            </li>
          </ul>
        </article>

        <article className="panel">
          <h2>{texts.sessionPanel}</h2>
          <ul className="metrics">
            <li>
              <span>{texts.state}</span>
              <strong>{session?.active ? texts.active : texts.stopped}</strong>
            </li>
            <li>
              <span>{texts.activeEmulator}</span>
              <strong>{session?.emulatorSerial ?? "-"}</strong>
            </li>
            <li>
              <span>{texts.proxyApplied}</span>
              <strong>{session?.proxyAddress ?? "-"}</strong>
            </li>
            <li>
              <span>{texts.localCa}</span>
              <strong className="mono">{session?.caCertificatePath ?? "-"}</strong>
            </li>
            <li>
              <span>{texts.startedAt}</span>
              <strong>{formatStartTime(session?.startedAtUnixMs ?? null)}</strong>
            </li>
          </ul>
        </article>
      </section>

      <section className="panel workspace-tabs-panel">
        <nav className="workspace-tabs" aria-label="Main workspace tabs">
          <button
            type="button"
            className={activeWorkspaceTab === "requests" ? "active" : ""}
            onClick={() => setActiveWorkspaceTab("requests")}
          >
            {texts.workspaceTabRequests}
          </button>
          <button
            type="button"
            className={activeWorkspaceTab === "interception" ? "active" : ""}
            onClick={() => setActiveWorkspaceTab("interception")}
          >
            {texts.workspaceTabInterception}
            {pendingIntercepts.length > 0 && <span className="tab-count">{pendingIntercepts.length}</span>}
          </button>
        </nav>
      </section>

      {activeWorkspaceTab === "interception" && (
      <section className="panel interception-panel">
        <div className="interception-header">
          <div className="interception-title-block">
            <h2>{texts.interceptionTitle}</h2>
            <div className="traffic-summary">
              <span className="traffic-badge">
                <span>{texts.interceptionRules}</span>
                <strong>{interceptionRulesSummary}</strong>
              </span>
            </div>
          </div>
          <div className="interception-controls">
            <div className="switch-field">
              <span>{texts.interceptionEnabled}</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={Boolean(interception?.enabled)}
                  disabled={busy || interceptBusy}
                  onChange={(event) => handleApplyInterceptionConfig(event.target.checked)}
                  aria-label={texts.interceptionEnabled}
                />
                <span className="toggle-slider" aria-hidden="true" />
              </label>
            </div>
            <button disabled={busy || interceptBusy} onClick={() => setRulesModalOpen(true)}>
              {texts.manageRules}
            </button>
          </div>
        </div>

        <div className="interception-grid">
          <div className="pending-list">
            <h3>
              {texts.pendingInterceptions} ({pendingIntercepts.length})
            </h3>
            {pendingIntercepts.length === 0 && <p className="muted">{texts.noPendingInterceptions}</p>}
            {pendingIntercepts.length > 0 && (
              <ul className="simple-list">
                {pendingIntercepts.map((pending) => (
                  <li
                    key={pending.id}
                    className={pending.id === selectedPendingId ? "selected-item" : ""}
                    onClick={() => setSelectedPendingId(pending.id)}
                  >
                    <span>{formatRequestTimestamp(pending.startedAtUnixMs)}</span>
                    <strong>{pending.method}</strong>
                    <code className="pending-target" title={`${pending.host}${pending.path}`}>
                      {pending.host}{pending.path}
                    </code>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="intercept-editor">
            <h3>{texts.interceptEditor}</h3>
            <div className="intercept-editor-content">
              {!selectedPending && <p className="muted">{texts.noPendingInterceptions}</p>}
              {selectedPending && (
                <>
                  <div className="editor-grid">
                    <label>
                      {texts.method}
                      <input value={editorMethod} onChange={(event) => setEditorMethod(event.target.value)} />
                    </label>
                    <label>
                      URL
                      <input value={editorUrl} onChange={(event) => setEditorUrl(event.target.value)} />
                    </label>
                  </div>
                  <label>
                    {texts.editorQuery}
                    <input value={editorQuery} onChange={(event) => setEditorQuery(event.target.value)} />
                  </label>
                  <label>
                    {texts.editorCookies}
                    <input value={editorCookies} onChange={(event) => setEditorCookies(event.target.value)} />
                  </label>
                  <label>
                    {texts.editorHeaders}
                    <textarea value={editorHeaders} onChange={(event) => setEditorHeaders(event.target.value)} rows={7} />
                  </label>
                  <label>
                    {texts.editorBody}
                    <textarea value={editorBody} onChange={(event) => setEditorBody(event.target.value)} rows={8} />
                  </label>
                  <div className="actions">
                    <button disabled={interceptBusy} onClick={() => handleInterceptDecision("forward")}>
                      {texts.forwardRequest}
                    </button>
                    <button className="danger" disabled={interceptBusy} onClick={() => handleInterceptDecision("drop")}>
                      {texts.dropRequest}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
      )}

      {activeWorkspaceTab === "requests" && (
      <>
      <section className="panel traffic-panel">
        <div className="traffic-header">
          <div className="traffic-title-block">
            <h2>{requestCountText}</h2>
            <div className="traffic-summary">
              <span className={`traffic-badge ${interception?.enabled ? "is-on" : "is-off"}`}>
                <span>{texts.requestsInterceptionLabel}</span>
                <strong>{interception?.enabled ? texts.requestsInterceptionOn : texts.requestsInterceptionOff}</strong>
              </span>
              <span className="traffic-badge">
                <span>{texts.requestsRulesLabel}</span>
                <strong>{interceptionRulesSummary}</strong>
              </span>
            </div>
          </div>
          <button onClick={handleClearCapturedRequests} disabled={busy || capturedRequests.length === 0}>
            {texts.clearSession}
          </button>
        </div>

        <div className="filters-row">
          <input
            value={searchFilter}
            onChange={(event) => setSearchFilter(event.target.value)}
            placeholder={texts.filterText}
            aria-label="Filtro texto host/path"
          />
          <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)} aria-label="Filtro metodo HTTP">
            <option value="all">{texts.allMethods}</option>
            {availableMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
          <input
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            placeholder={texts.filterStatus}
            aria-label="Filtro status code"
          />
          <select value={sortField} onChange={(event) => setSortField(event.target.value as SortField)} aria-label="Sort field">
            <option value="id">{texts.sortBy}: {texts.sortById}</option>
            <option value="startedAtUnixMs">{texts.sortBy}: {texts.sortByTime}</option>
          </select>
          <button onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}>
            {texts.sortDirection}: {sortDirection === "asc" ? texts.asc : texts.desc}
          </button>
          <button onClick={clearFilters} disabled={!hasActiveFilters}>
            {texts.clearFilters}
          </button>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{texts.timestamp}</th>
                <th>{texts.method}</th>
                <th>{texts.host}</th>
                <th>{texts.path}</th>
                <th>{texts.status}</th>
                <th>{texts.duration}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRequests.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    {capturedRequests.length === 0 ? texts.noTraffic : texts.noFilterResults}
                  </td>
                </tr>
              )}
              {visibleRequests.map((request) => (
                <tr
                  key={request.id}
                  className={request.id === selectedRequestId ? "selected" : ""}
                  onClick={() => setSelectedRequestId(request.id)}
                >
                  <td>{formatRequestTimestamp(request.startedAtUnixMs)}</td>
                  <td>{request.method}</td>
                  <td className="host-cell" title={request.host || "-"}>
                    {request.host || "-"}
                  </td>
                  <td className="mono path-cell" title={request.path}>
                    {request.path}
                  </td>
                  <td>{request.statusCode}</td>
                  <td>{request.durationMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel details-panel">
        <h2>{texts.detailTitle}</h2>
        {!selectedRequest && <p className="muted">{texts.selectRequest}</p>}
        {selectedRequest && (
          <>
            <div className="detail-title-row">
              <div className="detail-main-content">
                <p className="detail-method">
                  <strong>{selectedRequest.method}</strong>{" "}
                  <span className="mono detail-path">{selectedRequest.path}</span>
                </p>
                <p className="detail-url mono" title={selectedRequest.url}>{selectedRequest.url}</p>
              </div>
              <div className="detail-meta-actions">
                <div className="detail-status">
                  <span>{texts.status}</span>
                  <strong>{selectedRequest.statusCode}</strong>
                </div>
                <div className="detail-action-row">
                  <button onClick={() => handleCopy(selectedRequest.url)}>{texts.copyUrl}</button>
                  <button onClick={handleExportCurl}>{texts.exportCurl}</button>
                </div>
              </div>
            </div>

            <nav className="detail-tabs" aria-label="Request detail tabs">
              {DETAIL_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={activeDetailTab === tab ? "active" : ""}
                  onClick={() => setActiveDetailTab(tab)}
                >
                  {tab === "request" && texts.requestTab}
                  {tab === "response" && texts.responseTab}
                  {tab === "headers" && texts.headersTab}
                  {tab === "cookies" && texts.cookiesTab}
                  {tab === "params" && texts.paramsTab}
                  {tab === "timing" && texts.timingTab}
                </button>
              ))}
            </nav>

            {activeDetailTab === "request" && (
              <section className="detail-block">
                <div className="mini-metrics">
                  <span>{texts.requestSize}: {formatByteSize(selectedRequest.requestBodySize)}</span>
                  <span>{texts.timestamp}: {formatRequestTimestamp(selectedRequest.startedAtUnixMs)}</span>
                </div>
                <div className="detail-copy-row">
                  <button disabled={!requestTabCopyContent} onClick={() => handleCopy(requestTabCopyContent)}>
                    {texts.copyContent}
                  </button>
                </div>
                {selectedRequest.requestBody ? (
                  <pre className="body-preview"><code>{selectedRequest.requestBody}</code></pre>
                ) : (
                  <p className="muted">{texts.noBody}</p>
                )}
              </section>
            )}

            {activeDetailTab === "response" && (
              <section className="detail-block">
                <div className="mini-metrics">
                  <span>{texts.responseSize}: {formatByteSize(selectedRequest.responseBodySize)}</span>
                  <span>{texts.duration}: {selectedRequest.durationMs} ms</span>
                </div>
                <div className="detail-copy-row">
                  <button disabled={!responseTabCopyContent} onClick={() => handleCopy(responseTabCopyContent)}>
                    {texts.copyContent}
                  </button>
                </div>
                {selectedRequest.responseBody ? (
                  <pre className="body-preview"><code>{selectedRequest.responseBody}</code></pre>
                ) : (
                  <p className="muted">{texts.noBody}</p>
                )}
              </section>
            )}

            {activeDetailTab === "headers" && (
              <section className="headers-grid detail-block">
                <div>
                  <h3>{texts.requestHeaders}</h3>
                  <ul className="header-list">
                    {selectedRequest.requestHeaders.length === 0 && (
                      <li>
                        <span>{texts.noHeaders}</span>
                        <code>-</code>
                      </li>
                    )}
                    {selectedRequest.requestHeaders.map((header, index) => (
                      <li key={`${header.name}-${index}`}>
                        <span>{header.name}</span>
                        <code>
                          {!preferences.showSensitiveData && isSensitiveHeader(header.name)
                            ? maskSensitiveValue(header.value)
                            : header.value}
                        </code>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>{texts.responseHeaders}</h3>
                  <ul className="header-list">
                    {selectedRequest.responseHeaders.length === 0 && (
                      <li>
                        <span>{texts.noHeaders}</span>
                        <code>-</code>
                      </li>
                    )}
                    {selectedRequest.responseHeaders.map((header, index) => (
                      <li key={`${header.name}-${index}`}>
                        <span>{header.name}</span>
                        <code>
                          {!preferences.showSensitiveData && isSensitiveHeader(header.name)
                            ? maskSensitiveValue(header.value)
                            : header.value}
                        </code>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {activeDetailTab === "cookies" && (
              <section className="detail-block">
                {parsedCookies.length === 0 && <p className="muted">{texts.noCookies}</p>}
                {parsedCookies.length > 0 && (
                  <ul className="simple-list">
                    {parsedCookies.map((cookie, index) => (
                      <li key={`${cookie.source}-${cookie.name}-${index}`}>
                        <span>{cookie.source}</span>
                        <strong>{cookie.name}</strong>
                        <code>{preferences.showSensitiveData ? cookie.value : maskSensitiveValue(cookie.value)}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {activeDetailTab === "params" && (
              <section className="detail-block">
                {parsedParams.length === 0 && <p className="muted">{texts.noParams}</p>}
                {parsedParams.length > 0 && (
                  <ul className="simple-list">
                    {parsedParams.map((param, index) => (
                      <li key={`${param.name}-${index}`}>
                        <span>{texts.queryLabel}</span>
                        <strong>{param.name}</strong>
                        <code>{param.value}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {activeDetailTab === "timing" && (
              <section className="detail-block">
                <ul className="metrics">
                  <li>
                    <span>{texts.timestamp}</span>
                    <strong>{formatStartTime(selectedRequest.startedAtUnixMs)}</strong>
                  </li>
                  <li>
                    <span>{texts.duration}</span>
                    <strong>{selectedRequest.durationMs} ms</strong>
                  </li>
                  <li>
                    <span>{texts.requestBodySize}</span>
                    <strong>{formatByteSize(selectedRequest.requestBodySize)}</strong>
                  </li>
                  <li>
                    <span>{texts.responseBodySize}</span>
                    <strong>{formatByteSize(selectedRequest.responseBodySize)}</strong>
                  </li>
                  <li>
                    <span>{texts.interceptStatus}</span>
                    <strong>{selectedRequest.interceptStatus ?? "-"}</strong>
                  </li>
                  <li>
                    <span>{texts.originalRequest}</span>
                    <strong className="mono">
                      {selectedRequest.originalMethod && selectedRequest.originalUrl
                        ? `${selectedRequest.originalMethod} ${selectedRequest.originalUrl}`
                        : "-"}
                    </strong>
                  </li>
                </ul>
              </section>
            )}
          </>
        )}
      </section>
      </>
      )}

      {exitModalOpen && (
        <div className="modal-backdrop" onClick={handleCancelExit}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label={texts.exitPromptTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{texts.exitPromptTitle}</h3>
              <button type="button" onClick={handleCancelExit} disabled={exitBusy}>
                {texts.close}
              </button>
            </div>
            <p>{texts.exitPromptBody}</p>
            <section className="detail-block">
              <p>{texts.exitPromptProxyHint}</p>
              <p>{texts.exitPromptCertHint}</p>
            </section>
            <div className="actions modal-actions">
              <button type="button" onClick={handleCancelExit} disabled={exitBusy}>
                {texts.exitPromptCancel}
              </button>
              <button
                type="button"
                className="danger"
                disabled={exitBusy}
                onClick={() => void handleConfirmExit()}
              >
                {texts.exitPromptConfirm}
              </button>
            </div>
          </section>
        </div>
      )}

      {certInstallModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!busy) {
              setCertInstallModalOpen(false);
            }
          }}
        >
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label={texts.certInstallConsentTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{texts.certInstallConsentTitle}</h3>
              <button type="button" onClick={() => setCertInstallModalOpen(false)} disabled={busy}>
                {texts.close}
              </button>
            </div>
            <p>{texts.certInstallConsentBody}</p>
            <section className="detail-block">
              <h3>{texts.certInstallFlowLabel}</h3>
              <p>{texts.certInstallFlowDesc}</p>
            </section>
            <div className="actions modal-actions">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void runPrepareCertificateInstall()}
              >
                {texts.certInstallContinue}
              </button>
            </div>
          </section>
        </div>
      )}

      {rulesModalOpen && (
        <div className="modal-backdrop" onClick={() => setRulesModalOpen(false)}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label={texts.interceptionRules}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{texts.interceptionRules}</h3>
              <button type="button" onClick={() => setRulesModalOpen(false)} disabled={busy || interceptBusy}>
                {texts.close}
              </button>
            </div>
            <label className="modal-timeout-field">
              {texts.interceptionTimeout}
              <input
                value={interceptTimeoutInput}
                onChange={(event) => setInterceptTimeoutInput(event.target.value.replace(/[^\d]/g, ""))}
                disabled={busy || interceptBusy}
              />
            </label>
            {interceptRulesInput.length === 0 && (
              <>
                <p className="muted">{texts.interceptionRulesEmptyHint}</p>
                <p className="muted">{texts.interceptionRulesAddHint.replace("{action}", texts.addRule)}</p>
              </>
            )}
            {interceptRulesInput.length > 0 && (
              <div className="interception-rules">
                {interceptRulesInput.map((rule) => (
                  <div key={rule.id} className="rule-row">
                    <label className="rule-toggle">
                      <span>{texts.interceptionRuleEnabled}</span>
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        disabled={busy || interceptBusy}
                        onChange={(event) => handleUpdateInterceptionRule(rule.id, { enabled: event.target.checked })}
                      />
                    </label>
                    <label>
                      {texts.interceptionHostFilter}
                      <input
                        value={rule.hostContains}
                        onChange={(event) => handleUpdateInterceptionRule(rule.id, { hostContains: event.target.value })}
                        placeholder="api.example.com"
                        disabled={busy || interceptBusy}
                      />
                    </label>
                    <label>
                      {texts.interceptionPathFilter}
                      <input
                        value={rule.pathContains}
                        onChange={(event) => handleUpdateInterceptionRule(rule.id, { pathContains: event.target.value })}
                        placeholder="/v1/users"
                        disabled={busy || interceptBusy}
                      />
                    </label>
                    <label>
                      {texts.interceptionMethodFilter}
                      <select
                        value={rule.method}
                        onChange={(event) => handleUpdateInterceptionRule(rule.id, { method: event.target.value })}
                        disabled={busy || interceptBusy}
                      >
                        <option value="">{texts.interceptionAllMethods}</option>
                        {availableInterceptionMethods.map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="danger"
                      disabled={busy || interceptBusy}
                      onClick={() => handleRemoveInterceptionRule(rule.id)}
                    >
                      {texts.removeRule}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="actions modal-actions">
              <button type="button" disabled={busy || interceptBusy} onClick={handleAddInterceptionRule}>
                {texts.addRule}
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy || interceptBusy}
                onClick={async () => {
                  await handleApplyInterceptionConfig(Boolean(interception?.enabled));
                  setRulesModalOpen(false);
                }}
              >
                {texts.applyInterception}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
