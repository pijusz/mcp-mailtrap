import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getEnv } from "./config/env.ts";
import { createServer } from "./server.ts";
import { log } from "./utils/logger.ts";
import { NAME, VERSION } from "./version.ts";

const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  console.log(`${NAME} v${VERSION}`);
  process.exit(0);
}

try {
  getEnv();
} catch (err) {
  log.error(err instanceof Error ? err.message : "Failed to load environment");
  process.exit(1);
}

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);

log.info(`${NAME} v${VERSION} running on stdio`);

checkForUpdates().catch(() => {});

async function checkForUpdates(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(
      `https://api.github.com/repos/pijusz/${NAME}/releases/latest`,
      { signal: controller.signal },
    );
    if (!res.ok) return;

    const data = (await res.json()) as { tag_name?: string };
    const latest = data.tag_name?.replace(/^v/, "");
    if (latest && latest !== VERSION) {
      log.info(`Update available: v${latest} (current: v${VERSION})`);
    }
  } catch {
  } finally {
    clearTimeout(timer);
  }
}
