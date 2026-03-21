import { getAuthHeaders } from "../auth/index.ts";
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

      // Retry on 429 and 5xx
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        const wait = delay * 2 ** attempt;
        log.warn(
          `HTTP ${response.status} on ${init.method} ${url}, retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`,
        );
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      // Non-retryable error
      const body = await response.text();
      let message: string;
      try {
        const json = JSON.parse(body);
        message =
          json.errors?.join?.(", ") || json.error || JSON.stringify(json.errors) || body;
      } catch {
        message = body;
      }

      throw new Error(`Mailtrap API error ${response.status}: ${message}`);
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
  const headers = getAuthHeaders();

  const init: RequestInit = {
    method,
    headers,
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  log.debug(`${method} ${url}`);

  const response = await fetchWithRetry(url, init);

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) return undefined as T;

  return JSON.parse(text) as T;
}
