import { getEnv } from "../config/env.ts";
import { request } from "../services/mailtrap-api.ts";
import { log } from "./logger.ts";

interface Account {
  id: number;
  name: string;
  access_levels: number[];
}

let _accountId: string | null = null;

export async function resolveAccountId(): Promise<string> {
  if (_accountId) return _accountId;

  const env = getEnv();
  if (env.MAILTRAP_ACCOUNT_ID) {
    _accountId = env.MAILTRAP_ACCOUNT_ID;
    log.debug(`Using account ID from env: ${_accountId}`);
    return _accountId;
  }

  // Auto-discover
  const accounts = await request<Account[]>("GET", "/api/accounts");

  if (accounts.length === 0) {
    throw new Error(
      "No accounts found for this API token. Check your MAILTRAP_API_TOKEN.",
    );
  }

  if (accounts.length === 1) {
    _accountId = String(accounts[0].id);
    log.info(`Auto-discovered account: ${accounts[0].name} (${_accountId})`);
    return _accountId;
  }

  const list = accounts.map((a) => `  - ${a.id}: ${a.name}`).join("\n");
  throw new Error(`Multiple accounts found. Set MAILTRAP_ACCOUNT_ID to one of:\n${list}`);
}
