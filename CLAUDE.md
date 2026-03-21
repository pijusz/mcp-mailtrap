# mcp-mailtrap

MCP server for the Mailtrap email platform. Analytics-first with full CRUD.

## Quick Reference

- Runtime: Bun (dev) / Node (built)
- Entry: `src/index.ts`
- Build: `bun run build` → binary; `bun run build:npm` → `dist/index.js`
- Test: `bun test`
- Lint: `biome check src/`

## Architecture

- Single unified API client routes to 4 Mailtrap base URLs automatically
- All tools return `{ content: [{ type: "text", text }] }` MCP format
- `fetchWithRetry` handles 429/5xx with exponential backoff
- Account ID resolved lazily on first tool call (env var → auto-discover)
- 4 base URLs: mailtrap.io (general), send.api (transactional), bulk.api (bulk), sandbox.api (sandbox)

## Key Patterns

- Tool files export `registerXTools(server: McpServer)` functions
- Zod for parameter validation
- formatTable for analytics output (Metric | Count | Rate %)
- react-email renders component files (.tsx/.jsx/.js/.mjs) to HTML (not arbitrary strings)
- SMTP credentials redacted in sandbox inbox responses
- Multi-action tools use `action` param to consolidate CRUD operations

## Adding New Tools

1. Add tool in appropriate file under `src/tools/`
2. Use `server.tool(name, description, zodSchema, handler)`
3. Use `request<T>()` from mailtrap-api service
4. Use `resolveAccountId()` for account-scoped endpoints
5. Format output with `formatTable()` or `JSON.stringify(data, null, 2)`
6. Return `{ content: [{ type: "text" as const, text }] }`
7. Register in `src/tools/index.ts`
