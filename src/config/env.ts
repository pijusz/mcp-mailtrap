import { readFileSync } from "node:fs";
import { z } from "zod";
import { log } from "../utils/logger.ts";

const envSchema = z.object({
  MAILTRAP_API_TOKEN: z.string().min(1, "MAILTRAP_API_TOKEN is required"),
  MAILTRAP_SENDING_TOKEN: z.string().optional(),
  MAILTRAP_ACCOUNT_ID: z.string().optional(),
  MAILTRAP_TEST_INBOX_ID: z.string().optional(),
  MAILTRAP_DEFAULT_FROM_EMAIL: z.string().optional(),
  DEBUG: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;

  try {
    const text = readFileSync(".env", "utf-8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {}

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    log.error(`Environment validation failed:\n${messages}`);
    throw new Error(`Missing required environment variables:\n${messages}`);
  }

  _env = result.data;
  return _env;
}
