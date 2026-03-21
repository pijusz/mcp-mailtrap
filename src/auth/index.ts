import { getEnv } from "../config/env.ts";

/** Returns auth headers using the general API token. */
export function getAuthHeaders(): Record<string, string> {
  const env = getEnv();
  return {
    "Api-Token": env.MAILTRAP_API_TOKEN,
    "Content-Type": "application/json",
  };
}

/** Returns auth headers using the sending token (falls back to API token). */
export function getSendingAuthHeaders(): Record<string, string> {
  const env = getEnv();
  return {
    "Api-Token": env.MAILTRAP_SENDING_TOKEN ?? env.MAILTRAP_API_TOKEN,
    "Content-Type": "application/json",
  };
}
