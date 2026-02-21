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
  requestBody: string | null;
  responseBody: string | null;
  requestBodySize: number;
  responseBodySize: number;
  intercepted?: boolean;
  interceptStatus?: string | null;
  originalMethod?: string | null;
  originalUrl?: string | null;
};

type CertificateSetupResult = {
  certLocalPath: string;
  certEmulatorPath: string;
  installerLaunched: boolean;
  instructions: string;
};

type PendingInterceptRequest = {
  id: number;
  startedAtUnixMs: number;
  method: string;
  url: string;
  host: string;
  path: string;
  headers: HeaderEntry[];
  body: string | null;
  bodySize: number;
  status: string;
  lastError: string | null;
};

type InterceptionSnapshot = {
  enabled: boolean;
  timeoutMs: number;
  rules: InterceptionRule[];
  pendingCount: number;
  pendingRequests: PendingInterceptRequest[];
};

type InterceptionRule = {
  id: string;
  enabled: boolean;
  hostContains: string;
  pathContains: string;
  method: string;
};

type InterceptionConfigInput = {
  enabled: boolean;
  timeoutMs?: number;
  rules?: InterceptionRule[];
};

type InterceptDecisionInput = {
  requestId: number;
  action: "forward" | "drop";
  method?: string;
  url?: string;
  headers?: HeaderEntry[];
  body?: string;
  query?: string;
  cookies?: string;
};

type Language = "es" | "en";
type ThemeMode = "light" | "dark";
type FontScale = "small" | "medium" | "large";
type SortField = "id" | "startedAtUnixMs";
type SortDirection = "asc" | "desc";

type UserPreferences = {
  language: Language;
  theme: ThemeMode;
  fontScale: FontScale;
  showSensitiveData: boolean;
  certTrusted: boolean;
};

type OperationalState = {
  key: string;
  level: "ok" | "warn" | "error";
  title: string;
  description: string;
  action: string;
};

type LocaleTexts = {
  headerTitle: string;
  headerSubhead: string;
  settings: string;
  settingsTitle: string;
  language: string;
  theme: string;
  fontSize: string;
  sensitiveData: string;
  certTrusted: string;
  closeSettings: string;
  light: string;
  dark: string;
  fontSmall: string;
  fontMedium: string;
  fontLarge: string;
  showSensitive: string;
  hideSensitive: string;
  markCertTrusted: string;
  markCertPending: string;
  controls: string;
  emulator: string;
  proxyHost: string;
  proxyPort: string;
  refresh: string;
  prepareCa: string;
  startTracing: string;
  stopTracing: string;
  operationStatus: string;
  adbMissing: string;
  noEmulator: string;
  certNotTrusted: string;
  tracingActive: string;
  ready: string;
  adbMissingDesc: string;
  noEmulatorDesc: string;
  certNotTrustedDesc: string;
  tracingActiveDesc: string;
  readyDesc: string;
  adbMissingAction: string;
  noEmulatorAction: string;
  certNotTrustedAction: string;
  tracingActiveAction: string;
  readyAction: string;
  adbPanel: string;
  sessionPanel: string;
  adbAvailable: string;
  adbVersion: string;
  adbPath: string;
  emulatorsConnected: string;
  state: string;
  activeEmulator: string;
  proxyApplied: string;
  localCa: string;
  startedAt: string;
  active: string;
  stopped: string;
  requestsTitle: string;
  clearSession: string;
  filterText: string;
  filterMethod: string;
  filterStatus: string;
  allMethods: string;
  clearFilters: string;
  sortBy: string;
  sortDirection: string;
  sortById: string;
  sortByTime: string;
  asc: string;
  desc: string;
  timestamp: string;
  method: string;
  host: string;
  path: string;
  status: string;
  duration: string;
  noTraffic: string;
  noFilterResults: string;
  detailTitle: string;
  selectRequest: string;
  detailsFor: string;
  copied: string;
  copyFailed: string;
  copyUrl: string;
  exportCurl: string;
  requestTab: string;
  responseTab: string;
  headersTab: string;
  cookiesTab: string;
  paramsTab: string;
  timingTab: string;
  requestSize: string;
  responseSize: string;
  noBody: string;
  copyContent: string;
  requestHeaders: string;
  responseHeaders: string;
  noHeaders: string;
  noCookies: string;
  noParams: string;
  queryLabel: string;
  requestBodySize: string;
  responseBodySize: string;
  interceptStatus: string;
  originalRequest: string;
  interceptionTitle: string;
  interceptionEnabled: string;
  interceptionTimeout: string;
  interceptionHostFilter: string;
  interceptionPathFilter: string;
  interceptionMethodFilter: string;
  interceptionAllMethods: string;
  interceptionRuleEnabled: string;
  interceptionRules: string;
  interceptionRulesEmptyHint: string;
  manageRules: string;
  close: string;
  addRule: string;
  removeRule: string;
  applyInterception: string;
  pendingInterceptions: string;
  noPendingInterceptions: string;
  interceptEditor: string;
  editorHeaders: string;
  editorBody: string;
  editorQuery: string;
  editorCookies: string;
  forwardWithChanges: string;
  forwardWithoutChanges: string;
  dropRequest: string;
  intercepted: string;
  timeout: string;
  dropped: string;
};

const DEFAULT_PROXY_HOST = "10.0.2.2";
const DEFAULT_PROXY_PORT = "8877";
const DETAIL_TABS = ["request", "response", "headers", "cookies", "params", "timing"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];
const PREFERENCES_STORAGE_KEY = "http-request-tracer.preferences.v1";

const DEFAULT_PREFERENCES: UserPreferences = {
  language: "es",
  theme: "light",
  fontScale: "medium",
  showSensitiveData: false,
  certTrusted: false,
};

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
]);

const LOCALES: Record<Language, LocaleTexts> = {
  es: {
    headerTitle: "Android Emulator Proxy Console",
    headerSubhead:
      "Trazado HTTP/HTTPS local para emuladores Android, con captura, filtros, detalle e interceptación editable.",
    settings: "Configuracion",
    settingsTitle: "Preferencias",
    language: "Idioma",
    theme: "Tema",
    fontSize: "Tamano de fuente",
    sensitiveData: "Datos sensibles",
    certTrusted: "CA confiada en emulador",
    closeSettings: "Cerrar configuracion",
    light: "Claro",
    dark: "Oscuro",
    fontSmall: "Chico",
    fontMedium: "Medio",
    fontLarge: "Grande",
    showSensitive: "Mostrar valores reales",
    hideSensitive: "Ocultar valores sensibles",
    markCertTrusted: "Confiada",
    markCertPending: "Pendiente",
    controls: "Controles de tracing",
    emulator: "Emulador",
    proxyHost: "Proxy host (emulador)",
    proxyPort: "Proxy port",
    refresh: "Refresh",
    prepareCa: "Prepare CA Install",
    startTracing: "Start Tracing",
    stopTracing: "Stop Tracing",
    operationStatus: "Estados operativos",
    adbMissing: "ADB missing",
    noEmulator: "No emulator",
    certNotTrusted: "Cert not trusted",
    tracingActive: "Tracing active",
    ready: "Ready",
    adbMissingDesc: "No se encontró adb local para controlar el emulador.",
    noEmulatorDesc: "ADB responde, pero no hay emuladores online.",
    certNotTrustedDesc: "La CA local aun no fue marcada como confiada para HTTPS.",
    tracingActiveDesc: "El proxy MITM esta activo y capturando requests.",
    readyDesc: "ADB y emulador listos para iniciar trazado.",
    adbMissingAction: "Instala platform-tools o define ADB_PATH.",
    noEmulatorAction: "Inicia un AVD y verifica `adb devices`.",
    certNotTrustedAction: "Instala la CA en el emulador y marca como confiada.",
    tracingActiveAction: "Puedes inspeccionar, filtrar o interceptar requests.",
    readyAction: "Presiona Start Tracing para comenzar.",
    adbPanel: "ADB & Emuladores",
    sessionPanel: "Sesion de tracing",
    adbAvailable: "ADB disponible",
    adbVersion: "Version ADB",
    adbPath: "Ruta ADB",
    emulatorsConnected: "Emuladores conectados",
    state: "Estado",
    activeEmulator: "Emulador activo",
    proxyApplied: "Proxy aplicado",
    localCa: "CA local",
    startedAt: "Iniciado en",
    active: "Activo",
    stopped: "Detenido",
    requestsTitle: "Requests capturadas",
    clearSession: "Clear Session",
    filterText: "Buscar por host o path",
    filterMethod: "Filtro metodo HTTP",
    filterStatus: "Status: 200, 2xx, 400-499",
    allMethods: "Todos los metodos",
    clearFilters: "Limpiar filtros",
    sortBy: "Ordenar por",
    sortDirection: "Direccion",
    sortById: "ID",
    sortByTime: "Tiempo",
    asc: "ASC",
    desc: "DESC",
    timestamp: "Timestamp",
    method: "Method",
    host: "Host",
    path: "Path",
    status: "Status",
    duration: "Duracion",
    noTraffic: "Sin trafico capturado aun.",
    noFilterResults: "No hay resultados para los filtros actuales.",
    detailTitle: "Detalle de request",
    selectRequest: "Selecciona una request para ver request, response y metadata.",
    detailsFor: "Detalle",
    copied: "Copiado al portapapeles.",
    copyFailed: "No fue posible copiar al portapapeles.",
    copyUrl: "Copiar URL",
    exportCurl: "Exportar como cURL",
    requestTab: "Request",
    responseTab: "Response",
    headersTab: "Headers",
    cookiesTab: "Cookies",
    paramsTab: "Params",
    timingTab: "Timing",
    requestSize: "Request size",
    responseSize: "Response size",
    noBody: "No hay body textual disponible para esta captura.",
    copyContent: "Copiar contenido",
    requestHeaders: "Request headers",
    responseHeaders: "Response headers",
    noHeaders: "Sin headers",
    noCookies: "No se detectaron cookies en request/response.",
    noParams: "No se detectaron query params para esta request.",
    queryLabel: "Query",
    requestBodySize: "Request body size",
    responseBodySize: "Response body size",
    interceptStatus: "Estado interceptacion",
    originalRequest: "Original",
    interceptionTitle: "Intercepcion y reenvio",
    interceptionEnabled: "Modo interceptacion",
    interceptionTimeout: "Timeout (ms)",
    interceptionHostFilter: "Dominio contiene",
    interceptionPathFilter: "Path contiene",
    interceptionMethodFilter: "Metodo",
    interceptionAllMethods: "Todos",
    interceptionRuleEnabled: "Activa",
    interceptionRules: "Reglas",
    interceptionRulesEmptyHint: "Sin reglas activas: se intercepta todo.",
    manageRules: "Reglas",
    close: "Cerrar",
    addRule: "Agregar regla",
    removeRule: "Quitar",
    applyInterception: "Aplicar",
    pendingInterceptions: "Pendientes",
    noPendingInterceptions: "No hay requests pendientes de decision.",
    interceptEditor: "Editor de request interceptada",
    editorHeaders: "Headers (uno por linea: Nombre: Valor)",
    editorBody: "Body",
    editorQuery: "Query string",
    editorCookies: "Cookies",
    forwardWithChanges: "Reenviar con cambios",
    forwardWithoutChanges: "Reenviar sin cambios",
    dropRequest: "Descartar",
    intercepted: "interceptada",
    timeout: "timeout",
    dropped: "descartada",
  },
  en: {
    headerTitle: "Android Emulator Proxy Console",
    headerSubhead:
      "Local HTTP/HTTPS tracing for Android emulators, with capture, filters, details, and editable interception.",
    settings: "Settings",
    settingsTitle: "Preferences",
    language: "Language",
    theme: "Theme",
    fontSize: "Font size",
    sensitiveData: "Sensitive data",
    certTrusted: "CA trusted on emulator",
    closeSettings: "Close settings",
    light: "Light",
    dark: "Dark",
    fontSmall: "Small",
    fontMedium: "Medium",
    fontLarge: "Large",
    showSensitive: "Show real values",
    hideSensitive: "Mask sensitive values",
    markCertTrusted: "Trusted",
    markCertPending: "Pending",
    controls: "Tracing controls",
    emulator: "Emulator",
    proxyHost: "Proxy host (emulator)",
    proxyPort: "Proxy port",
    refresh: "Refresh",
    prepareCa: "Prepare CA Install",
    startTracing: "Start Tracing",
    stopTracing: "Stop Tracing",
    operationStatus: "Operational states",
    adbMissing: "ADB missing",
    noEmulator: "No emulator",
    certNotTrusted: "Cert not trusted",
    tracingActive: "Tracing active",
    ready: "Ready",
    adbMissingDesc: "adb binary was not found on this machine.",
    noEmulatorDesc: "ADB is reachable but no online emulator was found.",
    certNotTrustedDesc: "Local CA is not marked as trusted for HTTPS yet.",
    tracingActiveDesc: "MITM proxy is active and capturing traffic.",
    readyDesc: "ADB and emulator are ready to start tracing.",
    adbMissingAction: "Install platform-tools or set ADB_PATH.",
    noEmulatorAction: "Start an AVD and verify `adb devices`.",
    certNotTrustedAction: "Install CA in emulator and mark as trusted.",
    tracingActiveAction: "You can inspect, filter, or intercept requests.",
    readyAction: "Press Start Tracing to begin.",
    adbPanel: "ADB & Emulators",
    sessionPanel: "Tracing session",
    adbAvailable: "ADB available",
    adbVersion: "ADB version",
    adbPath: "ADB path",
    emulatorsConnected: "Connected emulators",
    state: "State",
    activeEmulator: "Active emulator",
    proxyApplied: "Applied proxy",
    localCa: "Local CA",
    startedAt: "Started at",
    active: "Active",
    stopped: "Stopped",
    requestsTitle: "Captured requests",
    clearSession: "Clear Session",
    filterText: "Search by host or path",
    filterMethod: "HTTP method filter",
    filterStatus: "Status: 200, 2xx, 400-499",
    allMethods: "All methods",
    clearFilters: "Clear filters",
    sortBy: "Sort by",
    sortDirection: "Direction",
    sortById: "ID",
    sortByTime: "Time",
    asc: "ASC",
    desc: "DESC",
    timestamp: "Timestamp",
    method: "Method",
    host: "Host",
    path: "Path",
    status: "Status",
    duration: "Duration",
    noTraffic: "No traffic captured yet.",
    noFilterResults: "No results for the current filters.",
    detailTitle: "Request details",
    selectRequest: "Select a request to view request, response, and metadata.",
    detailsFor: "Details",
    copied: "Copied to clipboard.",
    copyFailed: "Unable to copy to clipboard.",
    copyUrl: "Copy URL",
    exportCurl: "Export as cURL",
    requestTab: "Request",
    responseTab: "Response",
    headersTab: "Headers",
    cookiesTab: "Cookies",
    paramsTab: "Params",
    timingTab: "Timing",
    requestSize: "Request size",
    responseSize: "Response size",
    noBody: "No textual body available for this capture.",
    copyContent: "Copy content",
    requestHeaders: "Request headers",
    responseHeaders: "Response headers",
    noHeaders: "No headers",
    noCookies: "No cookies detected in request/response.",
    noParams: "No query params detected for this request.",
    queryLabel: "Query",
    requestBodySize: "Request body size",
    responseBodySize: "Response body size",
    interceptStatus: "Interception status",
    originalRequest: "Original",
    interceptionTitle: "Interception & replay",
    interceptionEnabled: "Interception mode",
    interceptionTimeout: "Timeout (ms)",
    interceptionHostFilter: "Host contains",
    interceptionPathFilter: "Path contains",
    interceptionMethodFilter: "Method",
    interceptionAllMethods: "All",
    interceptionRuleEnabled: "Enabled",
    interceptionRules: "Rules",
    interceptionRulesEmptyHint: "No active rules: intercept everything.",
    manageRules: "Rules",
    close: "Close",
    addRule: "Add rule",
    removeRule: "Remove",
    applyInterception: "Apply",
    pendingInterceptions: "Pending",
    noPendingInterceptions: "No requests pending decision.",
    interceptEditor: "Intercepted request editor",
    editorHeaders: "Headers (one per line: Name: Value)",
    editorBody: "Body",
    editorQuery: "Query string",
    editorCookies: "Cookies",
    forwardWithChanges: "Forward with changes",
    forwardWithoutChanges: "Forward without changes",
    dropRequest: "Drop",
    intercepted: "intercepted",
    timeout: "timeout",
    dropped: "dropped",
  },
};

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

function loadPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      language: parsed.language === "en" ? "en" : "es",
      theme: parsed.theme === "dark" ? "dark" : "light",
      fontScale:
        parsed.fontScale === "small" || parsed.fontScale === "large" ? parsed.fontScale : "medium",
      showSensitiveData: Boolean(parsed.showSensitiveData),
      certTrusted: Boolean(parsed.certTrusted),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function persistPreferences(next: UserPreferences) {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // noop: preference persistence is best-effort only.
  }
}

function formatByteSize(sizeInBytes: number): string {
  if (sizeInBytes < 1024) return `${sizeInBytes} B`;
  if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADERS.has(name.toLowerCase());
}

function maskSensitiveValue(value: string): string {
  if (!value) return "[redacted]";
  if (value.length <= 8) return "[redacted]";
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

function getHeaderValue(headers: HeaderEntry[], headerName: string): string | null {
  const match = headers.find((header) => header.name.toLowerCase() === headerName.toLowerCase());
  return match?.value ?? null;
}

function parseCookieEntries(selectedRequest: CapturedExchange): Array<{ source: "Request" | "Response"; name: string; value: string }> {
  const entries: Array<{ source: "Request" | "Response"; name: string; value: string }> = [];
  const requestCookieRaw = getHeaderValue(selectedRequest.requestHeaders, "cookie");

  if (requestCookieRaw) {
    requestCookieRaw
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => {
        const separatorIndex = entry.indexOf("=");
        const name = separatorIndex >= 0 ? entry.slice(0, separatorIndex).trim() : entry;
        const value = separatorIndex >= 0 ? entry.slice(separatorIndex + 1).trim() : "";
        entries.push({ source: "Request", name, value });
      });
  }

  selectedRequest.responseHeaders
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .forEach((header) => {
      const cookieToken = header.value.split(";")[0]?.trim();
      if (!cookieToken) return;
      const separatorIndex = cookieToken.indexOf("=");
      const name = separatorIndex >= 0 ? cookieToken.slice(0, separatorIndex).trim() : cookieToken;
      const value = separatorIndex >= 0 ? cookieToken.slice(separatorIndex + 1).trim() : "";
      entries.push({ source: "Response", name, value });
    });

  return entries;
}

function parseParamEntries(selectedRequest: CapturedExchange): Array<{ name: string; value: string }> {
  const paramEntries: Array<{ name: string; value: string }> = [];
  const pushParams = (search: string) => {
    const params = new URLSearchParams(search);
    params.forEach((value, name) => {
      paramEntries.push({ name, value });
    });
  };

  try {
    const url = new URL(selectedRequest.url);
    pushParams(url.search);
  } catch {
    const queryString = selectedRequest.path.includes("?") ? selectedRequest.path.slice(selectedRequest.path.indexOf("?")) : "";
    if (queryString) {
      pushParams(queryString);
    }
  }

  return paramEntries;
}

function matchesStatusFilter(statusCode: number, rawFilter: string): boolean {
  const filter = rawFilter.trim().toLowerCase();
  if (!filter) return true;

  if (/^\d{1,2}$/.test(filter)) {
    return statusCode.toString().startsWith(filter);
  }

  if (/^\d{3}$/.test(filter)) {
    return statusCode === Number(filter);
  }

  const rangeMatch = filter.match(/^(\d{1,3})\s*-\s*(\d{1,3})$/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    return statusCode >= min && statusCode <= max;
  }

  const classMatch = filter.match(/^([1-5])xx$/);
  if (classMatch) {
    const prefix = Number(classMatch[1]) * 100;
    return statusCode >= prefix && statusCode <= prefix + 99;
  }

  return true;
}

function escapeForSingleQuotedShell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function formatHeadersAsText(headers: HeaderEntry[], showSensitiveData: boolean): string {
  return headers
    .map((header) => {
      const value = !showSensitiveData && isSensitiveHeader(header.name)
        ? maskSensitiveValue(header.value)
        : header.value;
      return `${header.name}: ${value}`;
    })
    .join("\n");
}

function parseHeaderLines(raw: string): HeaderEntry[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(":");
      if (separator <= 0) {
        return { name: line, value: "" };
      }
      return {
        name: line.slice(0, separator).trim(),
        value: line.slice(separator + 1).trim(),
      };
    })
    .filter((entry) => entry.name.length > 0);
}

function createRuleId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rule-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

function createEmptyRule(): InterceptionRule {
  return {
    id: createRuleId(),
    enabled: true,
    hostContains: "",
    pathContains: "",
    method: "",
  };
}

function buildCurlCommand(request: CapturedExchange, showSensitiveData: boolean): string {
  const parts: string[] = ["curl", "-X", request.method.toUpperCase(), escapeForSingleQuotedShell(request.url)];

  request.requestHeaders.forEach((header) => {
    if (!showSensitiveData && isSensitiveHeader(header.name)) {
      return;
    }
    parts.push("-H", escapeForSingleQuotedShell(`${header.name}: ${header.value}`));
  });

  if (request.requestBody && request.requestBody.trim().length > 0) {
    parts.push("--data-raw", escapeForSingleQuotedShell(request.requestBody));
  }

  return parts.join(" ");
}

async function copyToClipboard(content: string): Promise<void> {
  if (!content) {
    throw new Error("Empty content");
  }

  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!ok) {
    throw new Error("copy command failed");
  }
}

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
      const snapshot = await invoke<InterceptionSnapshot>("get_interception_state");
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
      const nextSession = await invoke<TraceSessionSnapshot>("start_tracing", {
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
      const nextSession = await invoke<TraceSessionSnapshot>("stop_tracing");
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

    setBusy(true);
    setErrorText(null);
    setInfoText("Preparando certificado...");
    setCertInfoText(null);
    try {
      const result = await invoke<CertificateSetupResult>("prepare_certificate_install", {
        emulatorSerial: selectedEmulator,
      });
      setCertInfoText(
        `${result.instructions} Archivo local: ${result.certLocalPath}. Archivo en emulador: ${result.certEmulatorPath}.`,
      );
      updatePreferences({ certTrusted: false });
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
      const snapshot = await invoke<InterceptionSnapshot>("configure_interception", { config: payload });
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

  async function handleInterceptDecision(action: "forward" | "drop", applyEditorChanges: boolean) {
    if (!selectedPending) return;

    setInterceptBusy(true);
    setErrorText(null);

    const decision: InterceptDecisionInput = {
      requestId: selectedPending.id,
      action,
    };

    if (applyEditorChanges && action === "forward") {
      decision.method = editorMethod.trim() || undefined;
      decision.url = editorUrl.trim() || undefined;
      decision.headers = parseHeaderLines(editorHeaders);
      decision.body = editorBody;
      decision.query = editorQuery.trim();
      decision.cookies = editorCookies.trim();
    }

    try {
      const snapshot = await invoke<InterceptionSnapshot>("decide_intercept_request", { decision });
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

      <section className="panel interception-panel">
        <div className="interception-header">
          <h2>{texts.interceptionTitle}</h2>
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
            <label>
              {texts.interceptionTimeout}
              <input
                value={interceptTimeoutInput}
                onChange={(event) => setInterceptTimeoutInput(event.target.value.replace(/[^\d]/g, ""))}
                disabled={busy || interceptBusy}
              />
            </label>
            <button
              disabled={busy || interceptBusy}
              onClick={() => handleApplyInterceptionConfig(Boolean(interception?.enabled))}
            >
              {texts.applyInterception}
            </button>
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
                    <button disabled={interceptBusy} onClick={() => handleInterceptDecision("forward", true)}>
                      {texts.forwardWithChanges}
                    </button>
                    <button disabled={interceptBusy} onClick={() => handleInterceptDecision("forward", false)}>
                      {texts.forwardWithoutChanges}
                    </button>
                    <button className="danger" disabled={interceptBusy} onClick={() => handleInterceptDecision("drop", false)}>
                      {texts.dropRequest}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="panel traffic-panel">
        <div className="traffic-header">
          <h2>{requestCountText}</h2>
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
            {interceptRulesInput.length === 0 && <p className="muted">{texts.interceptionRulesEmptyHint}</p>}
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
