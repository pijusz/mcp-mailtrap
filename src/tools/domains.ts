import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatTable } from "../services/format.ts";
import { request } from "../services/mailtrap-api.ts";
import { resolveAccountId } from "../utils/account-id.ts";
import { readTool, writeTool } from "../utils/register-tool.ts";

export function registerDomainTools(server: McpServer): void {
  readTool(
    server,
    "list_domains",
    "List all sending domains with DNS verification status.",
    {},
    async () => {
      const accountId = await resolveAccountId();
      const data = await request<{ data: Record<string, unknown>[] }>(
        "GET",
        `/api/accounts/${accountId}/sending_domains`,
      );
      const domains = Array.isArray(data) ? data : (data.data ?? []);
      if (domains.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No sending domains found." }],
        };
      }
      const rows = domains.map((d: Record<string, unknown>) => ({
        ID: d.id,
        Domain: d.domain_name,
        "DNS Verified": d.dns_verified ? "Yes" : "No",
        Status: d.compliance_status,
        "Open Tracking": d.open_tracking_enabled ? "On" : "Off",
        "Click Tracking": d.click_tracking_enabled ? "On" : "Off",
      }));
      const text = formatTable(rows, "Sending Domains");
      return { content: [{ type: "text" as const, text }] };
    },
  );

  readTool(
    server,
    "get_domain",
    "Get a sending domain's details including DNS records and verification status.",
    {
      domain_id: z.number().describe("Sending domain ID"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const data = await request<Record<string, unknown>>(
        "GET",
        `/api/accounts/${accountId}/sending_domains/${args.domain_id}`,
      );
      const text = JSON.stringify(data, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  writeTool(
    server,
    "manage_domain",
    "Create or delete a sending domain.",
    {
      action: z.enum(["create", "delete"]).describe("Action to perform"),
      domain_name: z
        .string()
        .optional()
        .describe("Domain name to register (required for create)"),
      domain_id: z.number().optional().describe("Domain ID (required for delete)"),
    },
    async (args) => {
      const accountId = await resolveAccountId();

      if (args.action === "create") {
        if (!args.domain_name) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: domain_name is required for create action.",
              },
            ],
            isError: true,
          };
        }
        const data = await request<Record<string, unknown>>(
          "POST",
          `/api/accounts/${accountId}/sending_domains`,
          {
            body: {
              sending_domain: { domain_name: args.domain_name },
            },
          },
        );
        const text = `Domain created successfully.\n${JSON.stringify(data, null, 2)}`;
        return { content: [{ type: "text" as const, text }] };
      }

      if (args.action === "delete") {
        if (!args.domain_id) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: domain_id is required for delete action.",
              },
            ],
            isError: true,
          };
        }
        await request<void>(
          "DELETE",
          `/api/accounts/${accountId}/sending_domains/${args.domain_id}`,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Domain ${args.domain_id} deleted successfully.`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text" as const, text: `Unknown action: ${args.action}` }],
        isError: true,
      };
    },
  );

  writeTool(
    server,
    "send_domain_setup_instructions",
    "Email DNS setup instructions for a domain to a colleague.",
    {
      domain_id: z.number().describe("Sending domain ID"),
      email: z.string().describe("Email address to send instructions to"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      await request<void>(
        "POST",
        `/api/accounts/${accountId}/sending_domains/${args.domain_id}/send_setup_instructions`,
        { body: { email: args.email } },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Setup instructions sent to ${args.email}.`,
          },
        ],
      };
    },
  );
}
