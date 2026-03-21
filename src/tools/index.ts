import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAccountTools } from "./accounts.ts";
import { registerContactTools } from "./contacts.ts";
import { registerDomainTools } from "./domains.ts";
import { registerEmailLogTools } from "./email-logs.ts";
import { registerSandboxTools } from "./sandbox.ts";
import { registerSendingTools } from "./sending.ts";
import { registerStatsTools } from "./stats.ts";
import { registerTemplateTools } from "./templates.ts";

export function registerAllTools(server: McpServer): void {
  registerStatsTools(server);
  registerEmailLogTools(server);
  registerSendingTools(server);
  registerTemplateTools(server);
  registerContactTools(server);
  registerSandboxTools(server);
  registerDomainTools(server);
  registerAccountTools(server);
}
