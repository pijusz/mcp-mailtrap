import { getEnv } from "../config/env.ts";

export function getAuthHeaders(): Record<string, string> {
  const env = getEnv();
  return {
    "Api-Token": env.MAILTRAP_API_TOKEN,
    "Content-Type": "application/json",
  };
}
