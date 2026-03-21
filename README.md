<p align="center">
  <img src="logo.svg" alt="mcp-mailtrap" width="280" />
</p>

<p align="center">
  Mailtrap MCP server — analytics, email logs, contacts, sandbox testing & more via natural language.
  <br/>
  Built with Bun + TypeScript. Works with Claude, Cursor, and any MCP client.
</p>

---

## Quick Start

### 1. Get Your API Token

Get an API token from [Mailtrap API Tokens](https://mailtrap.io/api-tokens).

### 2. Add to Claude Code

```bash
claude mcp add mailtrap -e MAILTRAP_API_TOKEN=your_token -- npx mcp-mailtrap
```

That's it. Restart Claude Code and the tools are available.

> Also works with `bunx mcp-mailtrap@latest` if you have [Bun](https://bun.sh/).
> Requires Node 18+ when running via `npx`.

### Claude Desktop / Cursor

Add to your MCP settings JSON:

```json
{
  "mcpServers": {
    "mailtrap": {
      "command": "npx",
      "args": ["-y", "mcp-mailtrap@latest"],
      "env": {
        "MAILTRAP_API_TOKEN": "your_token"
      }
    }
  }
}
```

<details>
<summary>Alternative: standalone binary</summary>

Download a pre-built binary from [Releases](https://github.com/pijusz/mcp-mailtrap/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `mcp-mailtrap-darwin-arm64` |
| macOS (Intel) | `mcp-mailtrap-darwin-x64` |
| Linux | `mcp-mailtrap-linux-x64` |
| Windows | `mcp-mailtrap-windows-x64.exe` |

**macOS / Linux:**

```bash
curl -Lo mcp-mailtrap https://github.com/pijusz/mcp-mailtrap/releases/latest/download/mcp-mailtrap-darwin-arm64
chmod +x mcp-mailtrap
sudo mv mcp-mailtrap /usr/local/bin/
claude mcp add mailtrap -e MAILTRAP_API_TOKEN=your_token -- /usr/local/bin/mcp-mailtrap
```

**Windows (PowerShell):**

```powershell
Invoke-WebRequest -Uri "https://github.com/pijusz/mcp-mailtrap/releases/latest/download/mcp-mailtrap-windows-x64.exe" -OutFile "$env:LOCALAPPDATA\mcp-mailtrap.exe"
claude mcp add mailtrap -e MAILTRAP_API_TOKEN=your_token -- "%LOCALAPPDATA%\mcp-mailtrap.exe"
```

</details>

## Tools (48)

### Analytics
| Tool | Description |
|------|-------------|
| `get_stats` | Sending statistics — delivery, bounce, open, click, spam rates. Group by domain, category, ESP, or date |

### Email Logs
| Tool | Description |
|------|-------------|
| `get_email_logs` | List sent emails with filtering by status, stream, date. Cursor-based pagination |
| `get_email_log` | Single message detail with delivery events timeline |
| `get_suppressions` | List suppressed emails (bounces, spam complaints, unsubscribes) |
| `delete_suppression` | Re-enable sending to a suppressed address |
| `check_list_hygiene` | Cross-reference suppressions with contact lists, suggests cleanup actions |

### Sending
| Tool | Description |
|------|-------------|
| `send_email` | Send via transactional or bulk stream. Supports HTML, text, or templates |
| `batch_send` | Send up to 500 emails in one request |
| `send_test_email` | Send to a sandbox inbox for testing |

### Templates
| Tool | Description |
|------|-------------|
| `list_templates` | List all email templates |
| `get_template` | Get template details including HTML/text body |
| `create_template` | Create a new template |
| `update_template` | Update an existing template |
| `delete_template` | Delete a template |
| `render_react_email` | Render a react-email `.tsx` component to HTML + plain text |

### Contacts
| Tool | Description |
|------|-------------|
| `create_contact` | Create a contact with email, custom fields, list membership |
| `get_contact` | Get contact by UUID or email |
| `update_contact` | Update contact fields, list membership, subscription status |
| `delete_contact` | Delete a contact |
| `trigger_contact_event` | Trigger automations for a contact |
| `list_contact_lists` | List all contact lists |
| `get_contact_list` | Get a single contact list |
| `create_contact_list` | Create a new contact list |
| `update_contact_list` | Rename a contact list |
| `delete_contact_list` | Delete a contact list |
| `manage_contact_field` | List, get, create, update, or delete custom contact fields |
| `import_contacts` | Bulk import up to 50k contacts, or check import status |
| `export_contacts` | Start contact export or check export status |

### Email Sandbox
| Tool | Description |
|------|-------------|
| `list_projects` | List sandbox projects with inboxes |
| `get_project` | Get a single project |
| `manage_project` | Create, update, or delete a project |
| `list_inboxes` | List all sandbox inboxes |
| `get_inbox` | Get inbox details (credentials redacted by default) |
| `manage_inbox` | Create, update, clean, mark read, reset credentials, or delete |
| `get_messages` | List messages in a sandbox inbox |
| `get_message` | Get message body in HTML/text/raw/EML format, with optional attachments |
| `analyze_message` | Combined spam score + HTML analysis + headers report |
| `forward_message` | Forward a test message to an email |

### Domains
| Tool | Description |
|------|-------------|
| `list_domains` | List sending domains with DNS status |
| `get_domain` | Get domain details including DNS records |
| `manage_domain` | Create or delete a sending domain |
| `send_domain_setup_instructions` | Email DNS setup instructions to a colleague |

### Accounts
| Tool | Description |
|------|-------------|
| `list_accounts` | List accounts or get one by ID |
| `get_billing_usage` | Plan limits and current usage |
| `manage_account_access` | List, remove, update permissions, view resources |
| `manage_api_token` | List, get, create, delete, or reset API tokens |

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MAILTRAP_API_TOKEN` | Yes | — | API token from [mailtrap.io/api-tokens](https://mailtrap.io/api-tokens) |
| `MAILTRAP_ACCOUNT_ID` | No | auto-discovered | Default account ID |
| `MAILTRAP_DEFAULT_FROM_EMAIL` | No | — | Default sender email for `send_email` / `send_test_email` |
| `MAILTRAP_TEST_INBOX_ID` | No | — | Default sandbox inbox ID for `send_test_email` |
| `DEBUG` | No | — | Enable debug logging |

## Updates

**Using `npx @latest`** (recommended): You always get the latest version — no manual updates needed.

**Using a binary**: The server checks for new releases on startup and logs to stderr if outdated:

```
[mcp-mailtrap] Update available: v0.2.0 (current: v0.1.0)
```

Check your installed version:

```bash
mcp-mailtrap --version
```

## Development

Requires [Bun](https://bun.sh/).

```bash
git clone https://github.com/pijusz/mcp-mailtrap.git
cd mcp-mailtrap
bun install
bun test           # tests
bun run build      # standalone binary
bun run inspect    # MCP Inspector
bun run check      # biome format + lint
```

## License

MIT
