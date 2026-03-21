import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools/index.ts";
import { NAME, VERSION } from "./version.ts";

export function createServer(): McpServer {
  const server = new McpServer({
    name: NAME,
    version: VERSION,
  });

  registerAllTools(server);

  return server;
}
