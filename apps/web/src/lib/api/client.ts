export const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
export const signalrUrl = (process.env.NEXT_PUBLIC_SIGNALR_URL ?? `${apiBaseUrl}/hubs/realtime`).replace(/\/$/, "");

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

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: init.cache ?? "no-store",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const hasJson = contentType.includes("application/json");
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
