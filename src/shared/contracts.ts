export type EmulatorDevice = {
  serial: string;
};

export type AdbStatus = {
  adbAvailable: boolean;
  adbPath: string | null;
  adbVersion: string | null;
  emulators: EmulatorDevice[];
  message: string | null;
};

export type TraceSessionSnapshot = {
  active: boolean;
  emulatorSerial: string | null;
  proxyAddress: string | null;
  startedAtUnixMs: number | null;
  caCertificatePath: string | null;
  lastError: string | null;
};

export type HeaderEntry = {
  name: string;
  value: string;
};

export type CapturedExchange = {
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

export type CertificateSetupResult = {
  certLocalPath: string;
  certEmulatorPath: string;
  installerLaunched: boolean;
  installationStatus: "installed" | "pendingUserAction" | "failed";
  verificationNote: string;
  instructions: string;
};

export type PendingInterceptRequest = {
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

export type InterceptionSnapshot = {
  enabled: boolean;
  timeoutMs: number;
  rules: InterceptionRule[];
  pendingCount: number;
  pendingRequests: PendingInterceptRequest[];
};

export type InterceptionRule = {
  id: string;
  enabled: boolean;
  hostContains: string;
  pathContains: string;
  method: string;
};

export type InterceptionConfigInput = {
  enabled: boolean;
  timeoutMs?: number;
  rules?: InterceptionRule[];
};

export type InterceptDecisionInput = {
  requestId: number;
  action: "forward" | "drop";
  method?: string;
  url?: string;
  headers?: HeaderEntry[];
  body?: string;
  query?: string;
  cookies?: string;
};

export type Language = "es" | "en";
export type ThemeMode = "light" | "dark";
export type FontScale = "small" | "medium" | "large";
export type SortField = "id" | "startedAtUnixMs";
export type SortDirection = "asc" | "desc";
export type WorkspaceTab = "requests" | "interception";

export type UserPreferences = {
  language: Language;
  theme: ThemeMode;
  fontScale: FontScale;
  showSensitiveData: boolean;
  certTrusted: boolean;
};

export type OperationalState = {
  key: string;
  level: "ok" | "warn" | "error";
  title: string;
  description: string;
  action: string;
};

export type LocaleTexts = {
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
  certInstallConsentTitle: string;
  certInstallConsentBody: string;
  certInstallFlowLabel: string;
  certInstallFlowDesc: string;
  certInstallContinue: string;
  certInstallPreparing: string;
  exitPromptTitle: string;
  exitPromptBody: string;
  exitPromptProxyHint: string;
  exitPromptCertHint: string;
  exitPromptCancel: string;
  exitPromptConfirm: string;
  exitPromptClosing: string;
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
  requestsInterceptionLabel: string;
  requestsInterceptionOn: string;
  requestsInterceptionOff: string;
  requestsRulesLabel: string;
  requestsRulesConfigured: string;
  requestsRulesActive: string;
  workspaceTabRequests: string;
  workspaceTabInterception: string;
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
  forwardRequest: string;
  dropRequest: string;
  intercepted: string;
  timeout: string;
  dropped: string;
};
