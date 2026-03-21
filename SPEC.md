# mcp-mailtrap — Specification

## Overview

An independent, analytics-first MCP server for the Mailtrap email platform. Covers all three Mailtrap products (Email API, Email Marketing, Email Sandbox) with a focus on deliverability analytics, email logs, open/click rates, and list hygiene. Ships `@react-email/render` for rendering React components to email-compatible HTML when creating templates.

**Package name:** `mcp-mailtrap`
**Runtime:** Bun (development) / Node.js (built output)
**Entry point:** `src/index.ts`

---

## Architecture

### Base URLs

The API client abstracts four Mailtrap base URLs behind a single unified client:

| Service | Base URL |
|---------|----------|
| General / Management | `https://mailtrap.io` |
| Transactional Sending | `https://send.api.mailtrap.io` |
| Bulk Sending | `https://bulk.api.mailtrap.io` |
| Sandbox Sending | `https://sandbox.api.mailtrap.io` |

The client routes requests to the correct base URL automatically based on the operation.

### Authentication

- Header: `Api-Token: {token}` (primary)
- Fallback: `Authorization: Bearer {token}`

### Rate Limits

| Scope | Limit |
|-------|-------|
| General API | 150 req / 10 seconds |
| Contacts API | 200 req / 60 seconds |
| Stats API | 10 req / 60 seconds |
| Suppressions API | 10 req / 60 seconds |

Strategy: **Parallel requests with retry on 429**. Use `fetchWithRetry()` with exponential backoff (max 2 retries, 1000ms base delay, 30s timeout) — same pattern as mcp-gads and mcp-redtrack.

---

## Project Structure

```
mcp-mailtrap/
├── src/
│   ├── index.ts                 # Entry point, CLI flags, stdio transport
│   ├── server.ts                # MCP server factory, tool registration
│   ├── config/
│   │   └── env.ts               # Zod-validated environment config
│   ├── auth/
│   │   └── index.ts             # Token resolution
│   ├── services/
│   │   ├── mailtrap-api.ts      # Unified API client with routing + retry
│   │   └── format.ts            # Table/CSV formatting, rate conversion
│   ├── types/
│   │   └── generated.ts         # OpenAPI-generated types (all 8 specs)
│   ├── utils/
│   │   ├── logger.ts            # Stderr logger with [mcp-mailtrap] prefix
│   │   └── account-id.ts        # Account ID resolution (env → auto-discover)
│   └── tools/
│       ├── index.ts             # Tool registration hub
│       ├── sending.ts           # send_email, batch_send
│       ├── templates.ts         # Template CRUD with react-email rendering
│       ├── stats.ts             # All 5 stats endpoints + overview
│       ├── email-logs.ts        # Logs + suppressions + hygiene tool
│       ├── contacts.ts          # Contacts, lists, fields, imports, exports, events
│       ├── sandbox.ts           # Projects, inboxes, messages, analysis, attachments
│       ├── domains.ts           # Domain CRUD
│       └── accounts.ts          # Accounts, billing, API tokens
├── tests/
│   └── ...                      # Unit tests with mocked API responses
├── package.json
├── tsconfig.json
├── biome.json
├── CLAUDE.md
├── AGENTS.md
├── README.md
├── .env.example
└── .gitignore
```

---

## Environment Variables

```bash
# Required
MAILTRAP_API_TOKEN=          # API token from https://mailtrap.io/api-tokens

# Optional
MAILTRAP_ACCOUNT_ID=         # Default account ID (auto-discovered if not set)
DEBUG=                       # Enable debug logging
```

Account ID resolution (lazy, per-tool — NOT at startup):
1. `MAILTRAP_ACCOUNT_ID` env var (primary)
2. Auto-discover via `GET /api/accounts` — if exactly one account, use it and cache
3. If multiple accounts and no env var, return an error listing available accounts and ask the user to set `MAILTRAP_ACCOUNT_ID`

Resolution happens on the first tool call that needs an account ID, not at startup. This ensures `list_accounts` is always usable even when account ID is ambiguous.

---

## Dependencies

Match versions from existing MCP servers (mcp-gads, mcp-redtrack):

### Runtime
- `@modelcontextprotocol/sdk` v1.12.1
- `zod` v3.24.4
- `@react-email/render` (latest) — for template rendering

### Dev
- `@biomejs/biome` (latest v2.x)
- `@types/bun`
- `typescript` v5.7+
- `openapi-typescript` — for generating types from OpenAPI specs

---

## Type Generation

Download all 8 OpenAPI 3.1.0 specs from `github.com/mailtrap/mailtrap-openapi/tree/main/specs/`:
- `account-management.openapi.yml`
- `contacts.openapi.yml`
- `email-sending.openapi.yml`
- `email-sending-bulk.openapi.yml`
- `email-sending-transactional.openapi.yml`
- `sandbox-sending.openapi.yml`
- `sandbox.openapi.yml`
- `templates.openapi.yml`

Generate all types into `src/types/generated.ts`. Import selectively in tool files — only use what's needed.

Add a script: `"generate:types": "openapi-typescript specs/*.yml -o src/types/generated.ts"`

---

## API Client (`src/services/mailtrap-api.ts`)

Single unified client that routes to the correct base URL:

```typescript
// Core request function
request<T>(method, path, options?) → Promise<T>

// Routing logic:
// - paths starting with /api/send or /api/batch → detect stream from options
//   - stream: "transactional" → send.api.mailtrap.io
//   - stream: "bulk" → bulk.api.mailtrap.io
//   - stream: "sandbox" → sandbox.api.mailtrap.io
// - all other paths → mailtrap.io

// Retry logic
fetchWithRetry(url, init) → Promise<Response>
// - Retries on 429 and 5xx
// - Exponential backoff: 2 retries, 1000ms base delay
// - 30s timeout per request
```

---

## Tools Specification

### Naming Convention

All tool names use snake_case, prefixed by domain where needed for clarity.

### Response Format

All tools return: `{ content: [{ type: "text", text: string }] }`

### Output Formatting

Stats/analytics tools use `formatTable()` with columns: **Metric | Count | Rate (%)**
- Convert decimal rates to percentages (0.45 → 45.0%)
- Include both absolute counts and rates
- Use `formatTable()` for aligned columns

---

### 1. Stats Tools (`stats.ts`) — 1 tool

#### `get_stats`
Sending statistics with optional grouping.
- **Params:** `start_date` (required), `end_date` (required), `group_by` (optional: "domain"|"category"|"esp"|"date"), `sending_domain_ids` (optional, number[]), `sending_streams` (optional, "transactional"|"bulk"[]), `categories` (optional, string[]), `email_service_providers` (optional, string[])
- **API:** Routes based on `group_by`:
  - omitted → `GET /api/accounts/{account_id}/stats`
  - "domain" → `GET /api/accounts/{account_id}/stats/domains`
  - "category" → `GET /api/accounts/{account_id}/stats/categories`
  - "esp" → `GET /api/accounts/{account_id}/stats/email_service_providers`
  - "date" → `GET /api/accounts/{account_id}/stats/date`
- **Output:** formatTable with Metric | Count | Rate (%) columns. When grouped, shows a section per group.

---

### 2. Email Logs & Suppressions Tools (`email-logs.ts`) — 5 tools

#### `get_email_logs`
List sent email logs with filtering and cursor-based pagination.
- **Params:** `limit` (optional, default 50), `status` (optional: "delivered"|"not_delivered"|"enqueued"|"opted_out"), `sending_stream` (optional: "transactional"|"bulk"), `sent_after` (optional, datetime), `sent_before` (optional, datetime), `search` (optional, text/IP filter), `cursor` (optional, for pagination)
- **API:** `GET /api/accounts/{account_id}/email_logs`
- **Pagination:** cursor-based using `search_after` + `next_page_cursor`
- **Output:** formatTable with key fields, include `next_cursor` if more results

#### `get_email_log`
Get detailed log for a single message including delivery events.
- **Params:** `message_id` (required)
- **API:** `GET /api/accounts/{account_id}/email_logs/{sending_message_id}`
- **Output:** Full message detail + events timeline

#### `get_suppressions`
List suppressed email addresses (bounces, spam complaints, unsubscribes).
- **Params:** `email` (optional), `start_time` (optional), `end_time` (optional)
- **API:** `GET /api/accounts/{account_id}/suppressions`
- **Output:** formatTable with email, reason, date, sending stream

#### `delete_suppression`
Remove a suppression to re-enable sending to an address.
- **Params:** `suppression_id` (required)
- **API:** `DELETE /api/accounts/{account_id}/suppressions/{suppression_id}`

#### `check_list_hygiene`
Smart cross-reference tool: compares suppressed emails against contact lists to identify hygiene issues.
- **Params:** `list_id` (optional — check specific list, or all lists if omitted)
- **Logic:**
  1. Fetch all suppressions
  2. Fetch contacts in specified list(s)
  3. Cross-reference to find suppressed emails still in active lists
  4. Return report with suggested actions (specific API calls to fix each issue)
- **Output:** Report listing overlapping contacts with suggested remediation actions:
  - "Remove contact X from list Y (suppressed: hard bounce on 2025-01-15)"
  - "Consider removing contact Z (soft bounce, 3 occurrences)"

---

### 3. Sending Tools (`sending.ts`)

#### `send_email`
Send a single email via transactional or bulk stream.
- **Params:** `stream` (required: "transactional"|"bulk"), `from_email` (required), `from_name` (optional), `to` (required, array), `cc` (optional, array), `bcc` (optional, array), `subject` (required unless template), `html` (optional), `text` (optional), `template_uuid` (optional), `template_variables` (optional), `category` (optional), `custom_variables` (optional), `headers` (optional), `attachments` (optional)
- **API:** `POST /api/send` on send.api or bulk.api based on stream
- **Output:** Success with message IDs

#### `batch_send`
Send up to 500 emails in one request.
- **Params:** `stream` (required: "transactional"|"bulk"), `base` (optional shared properties), `requests` (required, array of email objects, max 500)
- **API:** `POST /api/batch` on send.api or bulk.api based on stream
- **Output:** Success/failure per message

#### `send_test_email`
Send a test email to a sandbox inbox.
- **Params:** `inbox_id` (required), plus same email params as `send_email` (from, to, subject, html/text/template)
- **API:** `POST /api/send/{inbox_id}` on sandbox.api

---

### 4. Template Tools (`templates.ts`) — 6 tools

Template CRUD passes `body_html` through to Mailtrap unchanged. For react-email powered templates, use `render_react_email` first to produce HTML from a `.tsx` file.

#### `list_templates`
- **API:** `GET /api/accounts/{account_id}/email_templates`

#### `get_template`
- **Params:** `template_id` (required)
- **API:** `GET /api/accounts/{account_id}/email_templates/{email_template_id}`

#### `create_template`
- **Params:** `name` (required), `subject` (required), `category` (required), `body_html` (required), `body_text` (optional)
- **API:** `POST /api/accounts/{account_id}/email_templates`
- **Note:** `body_html` is passed to Mailtrap as-is. Use `render_react_email` to produce HTML from a `.tsx` component first.

#### `update_template`
- **Params:** `template_id` (required), `name` (optional), `subject` (optional), `category` (optional), `body_html` (optional), `body_text` (optional)
- **API:** `PATCH /api/accounts/{account_id}/email_templates/{email_template_id}`

#### `delete_template`
- **Params:** `template_id` (required)
- **API:** `DELETE /api/accounts/{account_id}/email_templates/{email_template_id}`

#### `render_react_email`
Render a react-email `.tsx` component file to HTML and plain text. Does NOT call any Mailtrap API — purely local rendering.
- **Params:** `file_path` (required — absolute path to a `.tsx` file using react-email components)
- **Logic:**
  1. Dynamically import the `.tsx` file
  2. Call `render(Component, { pretty: true })` → HTML string
  3. Call `render(Component, { plainText: true })` → plain text string
- **Output:** `{ html: string, text: string }` — use these with `create_template` or `send_email`
- **Note:** The `.tsx` file must export a default React component using react-email primitives. This tool does NOT transform arbitrary HTML or generate HTML from descriptions.

---

### 5. Contact Tools (`contacts.ts`) — 14 tools

Import/export status merged into their respective tools.

#### `create_contact`
- **Params:** `email` (required), `fields` (optional), `list_ids` (optional)
- **API:** `POST /api/accounts/{account_id}/contacts`

#### `get_contact`
- **Params:** `identifier` (required — UUID or email)
- **API:** `GET /api/accounts/{account_id}/contacts/{contact_identifier}`

#### `update_contact`
- **Params:** `identifier` (required), `email` (optional), `fields` (optional), `list_ids_included` (optional), `list_ids_excluded` (optional), `unsubscribed` (optional)
- **API:** `PATCH /api/accounts/{account_id}/contacts/{contact_identifier}`

#### `delete_contact`
- **Params:** `identifier` (required)
- **API:** `DELETE /api/accounts/{account_id}/contacts/{contact_identifier}`

#### `trigger_contact_event`
Triggers automations for a contact.
- **Params:** `identifier` (required), `event_name` (required), `params` (optional)
- **API:** `POST /api/accounts/{account_id}/contacts/{contact_identifier}/events`

#### `list_contact_lists`
- **API:** `GET /api/accounts/{account_id}/contacts/lists`

#### `get_contact_list`
- **Params:** `list_id` (required)
- **API:** `GET /api/accounts/{account_id}/contacts/lists/{list_id}`

#### `create_contact_list`
- **Params:** `name` (required)
- **API:** `POST /api/accounts/{account_id}/contacts/lists`

#### `update_contact_list`
- **Params:** `list_id` (required), `name` (required)
- **API:** `PATCH /api/accounts/{account_id}/contacts/lists/{list_id}`

#### `delete_contact_list`
- **Params:** `list_id` (required)
- **API:** `DELETE /api/accounts/{account_id}/contacts/lists/{list_id}`

#### `manage_contact_field`
List, get, create, update, or delete custom contact fields.
- **Params:** `action` (required: "list"|"get"|"create"|"update"|"delete"), `field_id` (required for get/update/delete), `name` (required for create, optional for update), `data_type` (required for create: "text"|"integer"|"float"|"boolean"|"date"), `merge_tag` (optional)
- **API:** Routes based on action:
  - "list" → `GET /api/accounts/{account_id}/contacts/fields`
  - "get" → `GET /api/accounts/{account_id}/contacts/fields/{field_id}`
  - "create" → `POST /api/accounts/{account_id}/contacts/fields`
  - "update" → `PATCH .../contacts/fields/{field_id}`
  - "delete" → `DELETE .../contacts/fields/{field_id}`

#### `import_contacts`
Bulk import up to 50,000 contacts (async). Returns import status. Can also be called with just `import_id` to check status of a previous import.
- **Params:** `contacts` (optional, array of { email, fields?, list_ids_included?, list_ids_excluded? }), `import_id` (optional — to check status)
- **API:** `POST /api/accounts/{account_id}/contacts/imports` (create) or `GET .../imports/{import_id}` (status)

#### `export_contacts`
Start a contact export or check export status. Returns download URL when finished.
- **Params:** `filters` (optional, array of { name, operator, value }), `export_id` (optional — to check status)
- **API:** `POST /api/accounts/{account_id}/contacts/exports` (create) or `GET .../exports/{export_id}` (status)

---

### 6. Sandbox Tools (`sandbox.ts`) — 10 tools

Inbox actions (create, update, clean, mark_all_read, reset_credentials, delete) merged into `manage_inbox`. Attachments folded into `get_message` (with `attachment_id` for single attachment). Project CUD folded into `manage_project`.

#### `list_projects`
- **API:** `GET /api/accounts/{account_id}/projects`
- **Output:** Projects with their inboxes

#### `get_project`
- **Params:** `project_id` (required)
- **API:** `GET /api/accounts/{account_id}/projects/{project_id}`

#### `manage_project`
Create, update, or delete a sandbox project.
- **Params:** `action` (required: "create"|"update"|"delete"), `project_id` (required for update/delete), `name` (required for create/update, 2-100 chars)
- **API:** Routes based on action:
  - "create" → `POST /api/accounts/{account_id}/projects`
  - "update" → `PATCH /api/accounts/{account_id}/projects/{project_id}`
  - "delete" → `DELETE /api/accounts/{account_id}/projects/{project_id}`

#### `list_inboxes`
List all inboxes across projects. SMTP passwords redacted.
- **API:** `GET /api/accounts/{account_id}/inboxes`

#### `get_inbox`
Get inbox details. SMTP password redacted by default.
- **Params:** `inbox_id` (required), `show_credentials` (optional, default false)
- **API:** `GET /api/accounts/{account_id}/inboxes/{inbox_id}`
- **Output:** Inbox info. When `show_credentials=true`, includes SMTP username/password/host/ports.

#### `manage_inbox`
Perform inbox actions: create, update, clean, mark_all_read, reset_credentials, delete.
- **Params:** `action` (required: "create"|"update"|"clean"|"mark_all_read"|"reset_credentials"|"delete"), `inbox_id` (required for all except create), `project_id` (required for create), `name` (required for create/update), `email_username` (optional, for update)
- **API:** Routes based on action:
  - "create" → `POST /api/accounts/{account_id}/projects/{project_id}/inboxes`
  - "update" → `PATCH /api/accounts/{account_id}/inboxes/{inbox_id}`
  - "clean" → `PATCH /api/accounts/{account_id}/inboxes/{inbox_id}/clean`
  - "mark_all_read" → `PATCH /api/accounts/{account_id}/inboxes/{inbox_id}/all_read`
  - "reset_credentials" → `PATCH /api/accounts/{account_id}/inboxes/{inbox_id}/reset_credentials`
  - "delete" → `DELETE /api/accounts/{account_id}/inboxes/{inbox_id}`

#### `get_messages`
List messages in a sandbox inbox.
- **Params:** `inbox_id` (required), `search` (optional), `page` (optional), `last_id` (optional)
- **API:** `GET /api/accounts/{account_id}/inboxes/{inbox_id}/messages`
- **Output:** Up to 30 messages per page

#### `get_message`
Get a single message with body content. Can also list or fetch individual attachments.
- **Params:** `inbox_id` (required), `message_id` (required), `format` (optional: "html"|"text"|"raw"|"htmlsource"|"eml", default "html"), `include_attachments` (optional, default false), `attachment_id` (optional — fetch a specific attachment)
- **API:** `GET .../messages/{message_id}` + `GET .../messages/{message_id}/body.{format}` + optionally `GET .../messages/{message_id}/attachments` or `GET .../messages/{message_id}/attachments/{attachment_id}`
- **Output:** Message metadata + body content + attachment list/detail if requested

#### `analyze_message`
Combined analysis: spam report + HTML analysis + mail headers.
- **Params:** `inbox_id` (required), `message_id` (required)
- **API:** Calls three endpoints in parallel:
  - `GET .../messages/{message_id}/spam_report`
  - `GET .../messages/{message_id}/analyze`
  - `GET .../messages/{message_id}/mail_headers`
- **Output:** Combined report with spam score, HTML compatibility issues, and parsed headers

#### `forward_message`
- **Params:** `inbox_id` (required), `message_id` (required), `email` (required)
- **API:** `POST .../messages/{message_id}/forward`

---

### 7. Domain Tools (`domains.ts`) — 4 tools

#### `list_domains`
- **API:** `GET /api/accounts/{account_id}/sending_domains`

#### `get_domain`
- **Params:** `domain_id` (required)
- **API:** `GET /api/accounts/{account_id}/sending_domains/{sending_domain_id}`
- **Output:** Domain info with DNS records and verification status

#### `manage_domain`
Create or delete a sending domain.
- **Params:** `action` (required: "create"|"delete"), `domain_name` (required for create), `domain_id` (required for delete)
- **API:**
  - "create" → `POST /api/accounts/{account_id}/sending_domains`
  - "delete" → `DELETE /api/accounts/{account_id}/sending_domains/{domain_id}`

#### `send_domain_setup_instructions`
Email DNS setup instructions to a colleague.
- **Params:** `domain_id` (required), `email` (required)
- **API:** `POST /api/accounts/{account_id}/sending_domains/{domain_id}/send_setup_instructions`

---

### 8. Account Tools (`accounts.ts`) — 5 tools

#### `list_accounts`
Lists all accounts accessible to the current API token. Also supports getting a single account by ID.
- **Params:** `account_id` (optional — if provided, fetches a single account)
- **API:** `GET /api/accounts` (list) or `GET /api/accounts/{account_id}` (single)
- **Output:** Account(s) with access levels

#### `get_billing_usage`
Current billing cycle usage and plan limits.
- **Params:** none (uses resolved account_id)
- **API:** `GET /api/accounts/{account_id}/billing/usage`
- **Output:** formatTable showing plan name, sent/limit counts for testing and sending

#### `manage_account_access`
List or remove account access entries, bulk update permissions, or view available permission resources.
- **Params:** `action` (required: "list"|"remove"|"update_permissions"|"list_resources"), `access_id` (required for remove/update_permissions), `permissions` (required for update_permissions, array of { resource_id, resource_type, access_level, _destroy? })
- **API:**
  - "list" → `GET /api/accounts/{account_id}/account_accesses`
  - "remove" → `DELETE /api/accounts/{account_id}/account_accesses/{access_id}`
  - "update_permissions" → `PUT /api/accounts/{account_id}/account_accesses/{access_id}/permissions/bulk`
  - "list_resources" → `GET /api/accounts/{account_id}/permissions/resources`

#### `manage_api_token`
List, get, create, delete, or reset API tokens.
- **Params:** `action` (required: "list"|"get"|"create"|"delete"|"reset"), `token_id` (required for get/delete/reset), `name` (required for create), `resources` (required for create, array of { resource_type, resource_id, access_level })
- **API:** Routes based on action:
  - "list" → `GET /api/accounts/{account_id}/api_tokens`
  - "get" → `GET /api/accounts/{account_id}/api_tokens/{token_id}`
  - "create" → `POST /api/accounts/{account_id}/api_tokens`
  - "delete" → `DELETE /api/accounts/{account_id}/api_tokens/{token_id}`
  - "reset" → `POST /api/accounts/{account_id}/api_tokens/{token_id}/reset`

---

## Tool Count Summary

| File | Tools | Focus |
|------|-------|-------|
| `stats.ts` | 1 | Analytics with `group_by` param (aggregate/domain/category/ESP/date) |
| `email-logs.ts` | 5 | Logs, suppressions, list hygiene |
| `sending.ts` | 3 | Transactional, bulk, sandbox sending |
| `templates.ts` | 6 | Template CRUD + `render_react_email` |
| `contacts.ts` | 14 | Contacts, lists (incl. get), fields, events, import/export |
| `sandbox.ts` | 10 | Projects (list/get/manage), inboxes (list/get/manage), messages, analysis |
| `domains.ts` | 4 | Domain CRUD + setup instructions |
| `accounts.ts` | 5 | Accounts, billing, access + permissions, API tokens |
| **Total** | **48** | |

---

## react-email Integration

`@react-email/render` is shipped as a runtime dependency. It renders **React components** (JSX/TSX) to email-compatible HTML — it does NOT transform arbitrary HTML strings or natural-language descriptions.

### How it works

The `create_template` and `update_template` tools accept a `body_html` field (raw HTML string) which is passed directly to the Mailtrap API as-is.

For react-email powered templates, the LLM should:
1. Write a React component using react-email primitives (`Html`, `Text`, `Button`, `Section`, etc.)
2. Write the `.tsx` file to disk
3. The MCP provides a `render_template` utility that:
   - Dynamically imports the `.tsx` file
   - Calls `render(Component, { pretty: true })` to produce HTML
   - Calls `render(Component, { plainText: true })` to produce plain text
   - Returns both strings for use with `create_template` or `send_email`

### What react-email does NOT do
- It does not improve or transform arbitrary HTML strings
- It does not generate email HTML from natural-language descriptions
- It only renders valid React components that use react-email's component library

### Template rendering flow
```
LLM writes .tsx file → render_template(path) → { html, text } → create_template(body_html: html, body_text: text)
```

---

## Startup Flow

1. Check `--version` / `-v` flags → log version, exit
2. Check `setup` command → guide user through API token setup
3. Create MCP server via `createServer()`
4. Connect to stdio transport
5. Run preflight:
   - Validate `MAILTRAP_API_TOKEN` is set (fail if missing)
   - Log token presence (do NOT resolve account ID here — that's lazy, per-tool)
6. Non-blocking update check (GitHub releases, 3s timeout)

**Account ID is resolved lazily** on first tool call that needs it (see Environment Variables). This ensures the server always starts and `list_accounts` is always callable.

---

## Error Handling

Standard HTTP error mapping:
- `401` → "Authentication failed. Check your MAILTRAP_API_TOKEN."
- `403` → "Insufficient permissions. Your API token doesn't have access to this resource."
- `404` → "Resource not found."
- `422` → Forward validation error details from API
- `429` → Retry with exponential backoff (handled by `fetchWithRetry`)
- `5xx` → Retry with exponential backoff

All errors return: `{ content: [{ type: "text", text: errorMessage }], isError: true }`

---

## Testing Strategy

**Unit tests with mocked API responses.** No live API calls in tests.

- Mock HTTP responses for each endpoint
- Test tool logic: parameter validation, response formatting, error handling
- Test formatting utilities: rate conversion, table output
- Test API client: routing logic (which base URL for which operation), retry behavior
- Test account ID resolution logic
- Test hygiene tool cross-reference logic

Test runner: Bun's built-in test runner (`bun test`)

---

## Build & Scripts

```json
{
  "scripts": {
    "dev": "bun src/index.ts",
    "build": "bun build src/index.ts --compile --outfile mcp-mailtrap",
    "build:npm": "bun build src/index.ts --target node --outfile dist/index.js",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src/",
    "format": "biome format --write src/",
    "generate:types": "openapi-typescript specs/*.yml -o src/types/generated.ts",
    "inspect": "npx @modelcontextprotocol/inspector bun src/index.ts",
    "setup": "bun src/index.ts setup"
  }
}
```

---

## AGENTS.md Structure

Workflow-oriented documentation organized by user intent:

### Investigating Deliverability
1. Start with `get_stats` for overall delivery/bounce/spam rates
2. Drill down with `get_stats(group_by: "domain")` or `get_stats(group_by: "esp")` to find problem areas
3. Use `get_email_logs` with status filter for specific failed emails
4. Check `get_email_log` for individual message event timelines

### Monitoring Open & Click Rates
1. Use `get_stats` or `get_stats(group_by: "date")` for trends
2. Filter by `categories` to compare different email types
3. Use `get_stats(group_by: "esp")` to identify ESP-specific deliverability issues

### Managing Contact Lists
1. Use `list_contact_lists` to see available lists
2. Use `check_list_hygiene` to find suppressed contacts still in lists
3. Follow suggested actions to clean up lists
4. Use `import_contacts` for bulk additions

### Testing Emails
1. Use `send_test_email` to send to sandbox inbox
2. Use `get_messages` to see the email in the inbox
3. Use `analyze_message` for spam score + HTML compatibility report
4. Iterate on email content based on analysis

### Template Management
1. Use `list_templates` to see existing templates
2. Use `create_template` with `body_html` — or write a react-email `.tsx` component for production-quality output
3. Use `send_email` with `template_uuid` to send using the template
4. Track performance via `get_stats(group_by: "category")`

---

## CLAUDE.md Content

```markdown
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
- Types generated from Mailtrap OpenAPI specs

## Key Patterns

- Tool files export `registerXTools(server: McpServer)` functions
- Zod for parameter validation
- formatTable for analytics output (Metric | Count | Rate %)
- react-email renders .tsx components to HTML (not arbitrary strings)
- SMTP credentials redacted in sandbox inbox responses

## Adding New Tools

1. Add tool in appropriate file under `src/tools/`
2. Use `server.tool(name, description, zodSchema, handler)`
3. Use `request<T>()` from mailtrap-api service
4. Format output with `formatTable()` or JSON stringify
5. Return `{ content: [{ type: "text", text }] }`
6. Register in `src/tools/index.ts`
```

---

## Release Plan

Ship all features in v0.1.0 — complete product from day one:
- 48 tools across 8 tool files (consolidated via multi-action params where possible)
- Full analytics suite (stats with group_by, logs, suppressions, hygiene)
- Email sending (transactional, bulk, sandbox)
- Template management with react-email rendering
- Contact management (CRUD, lists, bulk import)
- Sandbox management (projects, inboxes, messages, analysis)
- Domain and account management
- Unit test suite with mocked API responses
