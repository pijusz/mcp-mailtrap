import { getAuthHeaders, getSendingAuthHeaders } from "../auth/index.ts";
import { log } from "../utils/logger.ts";

const BASE_URLS = {
  general: "https://mailtrap.io",
  transactional: "https://send.api.mailtrap.io",
  bulk: "https://bulk.api.mailtrap.io",
  sandbox: "https://sandbox.api.mailtrap.io",
} as const;

type Stream = "transactional" | "bulk" | "sandbox";

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | string[] | number | undefined>;
  stream?: Stream;
}

interface RetryOptions {
  retries?: number;
  delay?: number;
  timeout?: number;
}

function shouldUseSendingAuth(path: string, stream?: Stream): boolean {
  return (
    (stream === "transactional" || stream === "bulk") &&
    (path.startsWith("/api/send") || path.startsWith("/api/batch"))
  );
}

function resolveBaseUrl(path: string, stream?: Stream): string {
  if (stream) {
    return BASE_URLS[stream];
  }
  // Send/batch paths need a stream, default to general for everything else
  if (path.startsWith("/api/send") || path.startsWith("/api/batch")) {
    return BASE_URLS.transactional;
  }
  return BASE_URLS.general;
}

function buildQueryString(
  query?: Record<string, string | string[] | number | undefined>,
): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        params.append(`${key}[]`, v);
      }
    } else {
      params.append(key, String(value));
    }
  }
  const str = params.toString();
  return str ? `?${str}` : "";
}

/** Actionable next step for common auth/permission failures. */
export function errorHint(status: number, url: string): string {
  const isSend = /\/api\/(send|batch)/.test(url) && !url.includes("sandbox.api");
  const tokenVar = isSend
    ? "MAILTRAP_SENDING_TOKEN (or MAILTRAP_API_TOKEN)"
    : "MAILTRAP_API_TOKEN";
  if (status === 401) {
    return ` (check that ${tokenVar} is a valid, unrevoked token)`;
  }
  if (status === 403) {
    return ` (the token in ${tokenVar} lacks permission for this resource or account; check its access level in Mailtrap → Settings → API Tokens)`;
  }
  return "";
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RetryOptions = {},
): Promise<Response> {
  const { retries = 2, delay = 1000, timeout = 30000 } = opts;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      if (response.ok) {
        return response;
      }

      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        const wait = delay * 2 ** attempt;
        log.warn(
          `HTTP ${response.status} on ${init.method} ${url}, retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`,
        );
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      const body = await response.text();
      let message: string;
      try {
        const json = JSON.parse(body);
        message =
          json.errors?.join?.(", ") || json.error || JSON.stringify(json.errors) || body;
      } catch {
        message = body;
      }

      throw new Error(
        `Mailtrap API error ${response.status}: ${message}${errorHint(response.status, url)}`,
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (attempt < retries) {
          log.warn(`Request timeout on ${url}, retrying...`);
          continue;
        }
        throw new Error(`Request to ${url} timed out after ${timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("Unexpected: exhausted retries without returning");
}

export async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const baseUrl = resolveBaseUrl(path, options.stream);
  const qs = buildQueryString(options.query);
  const url = `${baseUrl}${path}${qs}`;
  const headers = shouldUseSendingAuth(path, options.stream)
    ? getSendingAuthHeaders()
    : getAuthHeaders();

  const init: RequestInit = {
    method,
    headers,
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  log.debug(`${method} ${url}`);

  const response = await fetchWithRetry(url, init);

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) return undefined as T;

  // Parse based on content-type — sandbox body endpoints return text/html, text/plain, etc.
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return JSON.parse(text) as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

/**
 * Request that always returns the response as a raw string (for body.html, body.txt, etc.)
 */
export async function requestText(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<string> {
  const baseUrl = resolveBaseUrl(path, options.stream);
  const qs = buildQueryString(options.query);
  const url = `${baseUrl}${path}${qs}`;
  const headers = shouldUseSendingAuth(path, options.stream)
    ? getSendingAuthHeaders()
    : getAuthHeaders();

  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  log.debug(`${method} ${url} (text)`);
  const response = await fetchWithRetry(url, init);
  return response.text();
}
