# mcp-mailtrap — Agent Guide

Workflow-oriented guide for AI agents using this MCP server.

## Authentication

Set `MAILTRAP_API_TOKEN` env var. Optionally set `MAILTRAP_SENDING_TOKEN` for transactional/bulk send.api requests and `MAILTRAP_ACCOUNT_ID` for a default account — otherwise the account is auto-discovered on first tool call.

## Workflows

### Investigating Deliverability

1. Start with `get_stats` for overall delivery/bounce/spam rates
2. Drill down with `get_stats(group_by: "domain")` or `get_stats(group_by: "esp")` to find problem areas
3. Use `get_email_logs` with `status: "not_delivered"` for specific failed emails
4. Check `get_email_log` for individual message event timelines

### Monitoring Open & Click Rates

1. Use `get_stats` for aggregate open/click rates
2. Use `get_stats(group_by: "date")` for trends over time
3. Filter by `categories` to compare different email types
4. Use `get_stats(group_by: "esp")` to identify ESP-specific deliverability issues

### Managing Contact Lists

1. Use `list_contact_lists` to see available lists
2. Use `check_list_hygiene` to find suppressed emails that still belong to contact lists
3. Follow suggested actions to clean up lists
4. Use `import_contacts` for bulk additions, `export_contacts` for bulk exports
5. Use `manage_contact_field` to manage custom fields for segmentation

### Testing Emails

1. Use `send_test_email` to send to a sandbox inbox (optionally using `MAILTRAP_TEST_INBOX_ID` / `MAILTRAP_DEFAULT_FROM_EMAIL` defaults)
2. Use `get_messages` to see the email in the inbox
3. Use `analyze_message` for combined spam score + HTML compatibility + headers report
4. Use `get_message(format: "htmlsource")` to inspect raw HTML
5. Iterate on email content based on analysis results

### Template Management

1. Use `list_templates` to see existing templates
2. Use `create_template` with `body_html` for raw HTML templates
3. For react-email templates: write a component file (`.tsx`, `.jsx`, `.js`, or `.mjs`), use `render_react_email` to produce HTML, then `create_template`
4. Use `send_email` with `template_uuid` to send using the template
5. Track template performance via `get_stats(group_by: "category")`

### Domain Setup

1. Use `manage_domain(action: "create")` to register a new domain
2. Use `get_domain` to see required DNS records and verification status
3. Use `send_domain_setup_instructions` to email DNS setup to a colleague
4. Check back with `get_domain` to verify DNS propagation

### Account & Billing

1. Use `list_accounts` to see all accessible accounts
2. Use `get_billing_usage` to check plan limits and current usage
3. Use `manage_api_token` to manage API tokens
4. Use `manage_account_access` to manage team permissions

## Tool Reference

### Stats (1 tool)
- `get_stats` — Aggregate or grouped stats. Use `group_by` for domain/category/esp/date breakdown.

### Email Logs (5 tools)
- `get_email_logs` — List sent emails with filters (status, stream, date). Cursor-based pagination with `limit` param.
- `get_email_log` — Single message detail with events timeline.
- `get_suppressions` — List bounced/spam/unsubscribed emails.
- `delete_suppression` — Re-enable sending to a suppressed address.
- `check_list_hygiene` — Look up suppressed emails as contacts and report which lists they still belong to.

### Sending (3 tools)
- `send_email` — Send via transactional or bulk stream. Supports HTML, text, or template_uuid.
- `batch_send` — Send up to 500 emails in one request.
- `send_test_email` — Send to a sandbox inbox for testing, with optional inbox/sender env defaults.

### Templates (6 tools)
- `list_templates`, `get_template`, `create_template`, `update_template`, `delete_template` — Standard CRUD.
- `render_react_email` — Render a react-email component file (`.tsx`, `.jsx`, `.js`, `.mjs`) to HTML + plain text. Use output with create_template.

### Contacts (14 tools)
- `create_contact`, `get_contact`, `update_contact`, `delete_contact` — Contact CRUD.
- `trigger_contact_event` — Trigger automations.
- `list_contact_lists`, `get_contact_list`, `create_contact_list`, `update_contact_list`, `delete_contact_list` — List management.
- `manage_contact_field` — Multi-action: list/get/create/update/delete custom fields.
- `import_contacts` — Bulk import (also checks import status).
- `export_contacts` — Bulk export (also checks export status).

### Sandbox (10 tools)
- `list_projects`, `get_project`, `manage_project` — Project CRUD.
- `list_inboxes`, `get_inbox`, `manage_inbox` — Inbox management (create/update/clean/mark_all_read/reset_credentials/delete).
- `get_messages`, `get_message` — Browse and read messages. `get_message` supports multiple formats and attachments.
- `analyze_message` — Combined spam + HTML + headers analysis.
- `forward_message` — Forward a test email.

### Domains (4 tools)
- `list_domains`, `get_domain` — View domains and DNS status.
- `manage_domain` — Create or delete domains.
- `send_domain_setup_instructions` — Email DNS setup instructions.

### Accounts (5 tools)
- `list_accounts` — List accounts or get one by ID.
- `get_billing_usage` — Plan limits and usage.
- `manage_account_access` — List/remove access, update permissions, list resources.
- `manage_api_token` — List/get/create/delete/reset tokens.

## Rate Limits

- General: 150 req / 10s
- Contacts: 200 req / 60s
- Stats & Suppressions: 10 req / 60s

The API client automatically retries on 429 with exponential backoff.
