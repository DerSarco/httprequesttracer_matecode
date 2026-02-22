import type {
  CapturedExchange,
  HeaderEntry,
  InterceptionRule,
} from "../contracts";

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
]);

export function formatStartTime(unixMs: number | null): string {
  if (!unixMs) return "-";
  return new Date(unixMs).toLocaleString();
}

export function formatRequestTimestamp(unixMs: number): string {
  return new Date(unixMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function toUserError(error: unknown): string {
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
  if (raw.includes("adb root failed")) {
    return `${raw} Sugerencia: usa un AVD debug/userdebug (no Play image) o completa la instalacion manual desde Settings.`;
  }
  if (raw.includes("adb remount failed")) {
    return `${raw} Sugerencia: el emulador no permite montar /system en escritura; usa instalacion manual o un AVD con root.`;
  }

  return raw;
}

export function formatByteSize(sizeInBytes: number): string {
  if (sizeInBytes < 1024) return `${sizeInBytes} B`;
  if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADERS.has(name.toLowerCase());
}

export function maskSensitiveValue(value: string): string {
  if (!value) return "[redacted]";
  if (value.length <= 8) return "[redacted]";
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

export function getHeaderValue(headers: HeaderEntry[], headerName: string): string | null {
  const match = headers.find((header) => header.name.toLowerCase() === headerName.toLowerCase());
  return match?.value ?? null;
}

export function parseCookieEntries(selectedRequest: CapturedExchange): Array<{ source: "Request" | "Response"; name: string; value: string }> {
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

export function parseParamEntries(selectedRequest: CapturedExchange): Array<{ name: string; value: string }> {
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

export function matchesStatusFilter(statusCode: number, rawFilter: string): boolean {
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

export function formatHeadersAsText(headers: HeaderEntry[], showSensitiveData: boolean): string {
  return headers
    .map((header) => {
      const value = !showSensitiveData && isSensitiveHeader(header.name)
        ? maskSensitiveValue(header.value)
        : header.value;
      return `${header.name}: ${value}`;
    })
    .join("\n");
}

export function parseHeaderLines(raw: string): HeaderEntry[] {
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

export function createRuleId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rule-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

export function createEmptyRule(): InterceptionRule {
  return {
    id: createRuleId(),
    enabled: true,
    hostContains: "",
    pathContains: "",
    method: "",
  };
}

export function buildCurlCommand(request: CapturedExchange, showSensitiveData: boolean): string {
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
