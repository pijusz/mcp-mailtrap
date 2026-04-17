import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatTable } from "../services/format.ts";
import { request } from "../services/mailtrap-api.ts";
import { resolveAccountId } from "../utils/account-id.ts";
import { readTool, writeTool } from "../utils/register-tool.ts";

export function registerAccountTools(server: McpServer): void {
  readTool(
    server,
    "list_accounts",
    "List all accounts accessible to the current API token, or get a single account by ID.",
    {
      account_id: z
        .number()
        .optional()
        .describe("Optional account ID to get a single account"),
    },
    async (args) => {
      if (args.account_id) {
        const data = await request<Record<string, unknown>>(
          "GET",
          `/api/accounts/${args.account_id}`,
        );
        const text = JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      }

      const data = await request<Record<string, unknown>[]>("GET", "/api/accounts");
      if (data.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No accounts found." }],
        };
      }
      const rows = data.map((a) => ({
        ID: a.id,
        Name: a.name,
        "Access Levels": Array.isArray(a.access_levels)
          ? (a.access_levels as number[])
              .map((l) => {
                if (l === 1000) return "owner";
                if (l === 100) return "admin";
                if (l === 10) return "viewer";
                return String(l);
              })
              .join(", ")
          : "",
      }));
      const text = formatTable(rows, "Accounts");
      return { content: [{ type: "text" as const, text }] };
    },
  );

  readTool(
    server,
    "get_billing_usage",
    "Get current billing cycle usage and plan limits for testing and sending.",
    {},
    async () => {
      const accountId = await resolveAccountId();
      const data = await request<Record<string, unknown>>(
        "GET",
        `/api/accounts/${accountId}/billing/usage`,
      );

      const billing = data.billing as Record<string, string> | undefined;
      const testing = data.testing as Record<string, unknown> | undefined;
      const sending = data.sending as Record<string, unknown> | undefined;

      const lines: string[] = [];

      if (billing) {
        lines.push(`Billing Cycle: ${billing.cycle_start} → ${billing.cycle_end}`);
      }

      if (testing) {
        const plan = testing.plan as Record<string, string> | undefined;
        const usage = testing.usage as Record<string, Record<string, number>> | undefined;
        lines.push(`\nTesting Plan: ${plan?.name ?? "N/A"}`);
        if (usage?.sent_messages_count) {
          lines.push(
            `  Sent: ${usage.sent_messages_count.current} / ${usage.sent_messages_count.limit}`,
          );
        }
        if (usage?.forwarded_messages_count) {
          lines.push(
            `  Forwarded: ${usage.forwarded_messages_count.current} / ${usage.forwarded_messages_count.limit}`,
          );
        }
      }

      if (sending) {
        const plan = sending.plan as Record<string, string> | undefined;
        const usage = sending.usage as Record<string, Record<string, number>> | undefined;
        lines.push(`\nSending Plan: ${plan?.name ?? "N/A"}`);
        if (usage?.sent_messages_count) {
          lines.push(
            `  Sent: ${usage.sent_messages_count.current} / ${usage.sent_messages_count.limit}`,
          );
        }
      }

      const text = lines.join("\n");
      return { content: [{ type: "text" as const, text }] };
    },
  );

  writeTool(
    server,
    "manage_account_access",
    "List, remove, or update account access entries and permissions.",
    {
      action: z
        .enum(["list", "remove", "update_permissions", "list_resources"])
        .describe("Action to perform"),
      access_id: z
        .number()
        .optional()
        .describe("Account access ID (required for remove/update_permissions)"),
      permissions: z
        .array(
          z.object({
            resource_id: z.string(),
            resource_type: z.string(),
            access_level: z.number(),
            _destroy: z.boolean().optional(),
          }),
        )
        .optional()
        .describe("Permissions array (required for update_permissions)"),
    },
    async (args) => {
      const accountId = await resolveAccountId();

      switch (args.action) {
        case "list": {
          const data = await request<Record<string, unknown>[]>(
            "GET",
            `/api/accounts/${accountId}/account_accesses`,
          );
          const text = JSON.stringify(data, null, 2);
          return { content: [{ type: "text" as const, text }] };
        }

        case "remove": {
          if (!args.access_id) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: access_id is required for remove action.",
                },
              ],
              isError: true,
            };
          }
          const data = await request<Record<string, unknown>>(
            "DELETE",
            `/api/accounts/${accountId}/account_accesses/${args.access_id}`,
          );
          const text = `Access ${args.access_id} removed.\n${JSON.stringify(data, null, 2)}`;
          return { content: [{ type: "text" as const, text }] };
        }

        case "update_permissions": {
          if (!args.access_id || !args.permissions) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: access_id and permissions are required for update_permissions.",
                },
              ],
              isError: true,
            };
          }
          const data = await request<Record<string, unknown>>(
            "PUT",
            `/api/accounts/${accountId}/account_accesses/${args.access_id}/permissions/bulk`,
            { body: { permissions: args.permissions } },
          );
          const text = `Permissions updated.\n${JSON.stringify(data, null, 2)}`;
          return { content: [{ type: "text" as const, text }] };
        }

        case "list_resources": {
          const data = await request<Record<string, unknown>[]>(
            "GET",
            `/api/accounts/${accountId}/permissions/resources`,
          );
          const text = JSON.stringify(data, null, 2);
          return { content: [{ type: "text" as const, text }] };
        }

        default:
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown action: ${args.action}`,
              },
            ],
            isError: true,
          };
      }
    },
  );

  writeTool(
    server,
    "manage_api_token",
    "List, get, create, delete, or reset API tokens.",
    {
      action: z
        .enum(["list", "get", "create", "delete", "reset"])
        .describe("Action to perform"),
      token_id: z
        .number()
        .optional()
        .describe("Token ID (required for get/delete/reset)"),
      name: z.string().optional().describe("Token name (required for create)"),
      resources: z
        .array(
          z.object({
            resource_type: z.string(),
            resource_id: z.union([z.number(), z.string()]),
            access_level: z.number(),
          }),
        )
        .optional()
        .describe("Resource permissions (required for create)"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const basePath = `/api/accounts/${accountId}/api_tokens`;

      switch (args.action) {
        case "list": {
          const data = await request<Record<string, unknown>[]>("GET", basePath);
          if (data.length === 0) {
            return {
              content: [{ type: "text" as const, text: "No API tokens found." }],
            };
          }
          const rows = data.map((t) => ({
            ID: t.id,
            Name: t.name,
            "Last 4": t.last_4_digits,
            "Created By": t.created_by,
            "Expires At": t.expires_at ?? "Never",
          }));
          const text = formatTable(rows, "API Tokens");
          return { content: [{ type: "text" as const, text }] };
        }

        case "get": {
          if (!args.token_id) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: token_id is required for get action.",
                },
              ],
              isError: true,
            };
          }
          const data = await request<Record<string, unknown>>(
            "GET",
            `${basePath}/${args.token_id}`,
          );
          const text = JSON.stringify(data, null, 2);
          return { content: [{ type: "text" as const, text }] };
        }

        case "create": {
          if (!args.name || !args.resources) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: name and resources are required for create action.",
                },
              ],
              isError: true,
            };
          }
          const data = await request<Record<string, unknown>>("POST", basePath, {
            body: { name: args.name, resources: args.resources },
          });
          const text = `Token created. SAVE THIS — the full token is only shown once:\n${JSON.stringify(data, null, 2)}`;
          return { content: [{ type: "text" as const, text }] };
        }

        case "delete": {
          if (!args.token_id) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: token_id is required for delete action.",
                },
              ],
              isError: true,
            };
          }
          await request<void>("DELETE", `${basePath}/${args.token_id}`);
          return {
            content: [
              {
                type: "text" as const,
                text: `Token ${args.token_id} deleted.`,
              },
            ],
          };
        }

        case "reset": {
          if (!args.token_id) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: token_id is required for reset action.",
                },
              ],
              isError: true,
            };
          }
          const data = await request<Record<string, unknown>>(
            "POST",
            `${basePath}/${args.token_id}/reset`,
          );
          const text = `Token reset. SAVE THIS — the full token is only shown once:\n${JSON.stringify(data, null, 2)}`;
          return { content: [{ type: "text" as const, text }] };
        }

        default:
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown action: ${args.action}`,
              },
            ],
            isError: true,
          };
      }
    },
  );
}
