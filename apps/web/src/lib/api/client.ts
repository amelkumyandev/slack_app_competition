const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function getDefaultApiBaseUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:8080";
  }

  return `${window.location.protocol}//${window.location.hostname}:8080`;
}

function normalizeLoopbackHost(value: string) {
  if (typeof window === "undefined") {
    return trimTrailingSlash(value);
  }

  try {
    const url = new URL(value);
    const browserHost = window.location.hostname;

    if (loopbackHosts.has(url.hostname) && loopbackHosts.has(browserHost) && url.hostname !== browserHost) {
      url.hostname = browserHost;
    }

    return trimTrailingSlash(url.toString());
  } catch {
    return trimTrailingSlash(value);
  }
}

export const apiBaseUrl = normalizeLoopbackHost(process.env.NEXT_PUBLIC_API_BASE_URL ?? getDefaultApiBaseUrl());
export const signalrUrl = normalizeLoopbackHost(
  process.env.NEXT_PUBLIC_SIGNALR_URL ?? `${apiBaseUrl}/hubs/realtime`,
);

export class ApiClientError extends Error {
  status: number;
  title: string;
  detail: string;

  constructor(status: number, title: string, detail: string) {
    super(detail || title);
    this.name = "ApiClientError";
    this.status = status;
    this.title = title;
    this.detail = detail;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: init.cache ?? "no-store",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const hasJson = /\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType);
  const payload = hasJson ? await response.json() : null;

  if (!response.ok) {
    const title =
      typeof payload?.title === "string" && payload.title.trim().length > 0
        ? payload.title
        : "request_failed";
    const detail =
      typeof payload?.detail === "string" && payload.detail.trim().length > 0
        ? payload.detail
        : "The request could not be completed.";

    throw new ApiClientError(response.status, title, detail);
  }

  return payload as T;
}
