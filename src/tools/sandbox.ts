import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatTable } from "../services/format.ts";
import { request, requestText } from "../services/mailtrap-api.ts";
import { resolveAccountId } from "../utils/account-id.ts";
import { readTool, writeTool } from "../utils/register-tool.ts";
import { requireArgs } from "../utils/tool-result.ts";

function redactPassword(obj: Record<string, unknown>): Record<string, unknown> {
  if ("password" in obj) {
    return { ...obj, password: "***" };
  }
  return obj;
}

export function registerSandboxTools(server: McpServer): void {
  readTool(server, "list_projects", "List all sandbox projects.", {}, async () => {
    const accountId = await resolveAccountId();
    const data = await request<Record<string, unknown>[]>(
      "GET",
      `/api/accounts/${accountId}/projects`,
    );
    const rows = data.map((p) => ({
      id: p.id,
      name: p.name,
    }));
    const text = formatTable(rows, "Sandbox Projects");
    return { content: [{ type: "text" as const, text }] };
  });

  readTool(
    server,
    "get_project",
    "Get details of a single sandbox project.",
    {
      project_id: z.number().describe("Project ID"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const data = await request<Record<string, unknown>>(
        "GET",
        `/api/accounts/${accountId}/projects/${args.project_id}`,
      );
      const text = JSON.stringify(data, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  writeTool(
    server,
    "manage_project",
    "Create, update, or delete a sandbox project.",
    {
      action: z.enum(["create", "update", "delete"]).describe("Action to perform"),
      project_id: z
        .number()
        .optional()
        .describe("Project ID (required for update/delete)"),
      name: z
        .string()
        .min(2)
        .max(100)
        .optional()
        .describe("Project name (required for create, optional for update)"),
    },
    async (args) => {
      const invalid = requireArgs(
        args,
        args.action === "create"
          ? ["name"]
          : args.action === "update"
            ? ["project_id", "name"]
            : ["project_id"],
        args.action,
      );
      if (invalid) return invalid;
      const accountId = await resolveAccountId();

      if (args.action === "create") {
        const data = await request<Record<string, unknown>>(
          "POST",
          `/api/accounts/${accountId}/projects`,
          { body: { project: { name: args.name } } },
        );
        const text = JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      }

      if (args.action === "update") {
        const data = await request<Record<string, unknown>>(
          "PATCH",
          `/api/accounts/${accountId}/projects/${args.project_id}`,
          { body: { project: { name: args.name } } },
        );
        const text = JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      }

      await request<undefined>(
        "DELETE",
        `/api/accounts/${accountId}/projects/${args.project_id}`,
      );
      const text = `Project ${args.project_id} deleted successfully.`;
      return { content: [{ type: "text" as const, text }] };
    },
  );

  readTool(server, "list_inboxes", "List all sandbox inboxes.", {}, async () => {
    const accountId = await resolveAccountId();
    const data = await request<Record<string, unknown>[]>(
      "GET",
      `/api/accounts/${accountId}/inboxes`,
    );
    const rows = data.map((inbox) => {
      const redacted = redactPassword(inbox);
      return {
        id: redacted.id,
        name: redacted.name,
        emails_count: redacted.emails_count,
        project_id: redacted.project_id,
      };
    });
    const text = formatTable(rows, "Sandbox Inboxes");
    return { content: [{ type: "text" as const, text }] };
  });

  readTool(
    server,
    "get_inbox",
    "Get details of a single sandbox inbox.",
    {
      inbox_id: z.number().describe("Inbox ID"),
      show_credentials: z
        .boolean()
        .optional()
        .default(false)
        .describe("Show SMTP credentials including password (default false)"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const data = await request<Record<string, unknown>>(
        "GET",
        `/api/accounts/${accountId}/inboxes/${args.inbox_id}`,
      );
      const output = args.show_credentials ? data : redactPassword(data);
      const text = JSON.stringify(output, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  writeTool(
    server,
    "manage_inbox",
    "Create, update, clean, mark all read, reset credentials, or delete a sandbox inbox.",
    {
      action: z
        .enum([
          "create",
          "update",
          "clean",
          "mark_all_read",
          "reset_credentials",
          "delete",
        ])
        .describe("Action to perform"),
      inbox_id: z
        .number()
        .optional()
        .describe(
          "Inbox ID (required for update/clean/mark_all_read/reset_credentials/delete)",
        ),
      project_id: z.number().optional().describe("Project ID (required for create)"),
      name: z
        .string()
        .optional()
        .describe("Inbox name (required for create, optional for update)"),
      email_username: z
        .string()
        .optional()
        .describe("Custom email username (optional, for update only)"),
    },
    async (args) => {
      const invalid = requireArgs(
        args,
        args.action === "create" ? ["project_id", "name"] : ["inbox_id"],
        args.action,
      );
      if (invalid) return invalid;
      const accountId = await resolveAccountId();

      if (args.action === "create") {
        const data = await request<Record<string, unknown>>(
          "POST",
          `/api/accounts/${accountId}/projects/${args.project_id}/inboxes`,
          { body: { inbox: { name: args.name } } },
        );
        const text = JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      }

      if (args.action === "update") {
        const inbox: Record<string, string> = {};
        if (args.name !== undefined) inbox.name = args.name;
        if (args.email_username !== undefined) inbox.email_username = args.email_username;
        const data = await request<Record<string, unknown>>(
          "PATCH",
          `/api/accounts/${accountId}/inboxes/${args.inbox_id}`,
          { body: { inbox } },
        );
        const text = JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      }

      if (args.action === "clean") {
        await request<Record<string, unknown>>(
          "PATCH",
          `/api/accounts/${accountId}/inboxes/${args.inbox_id}/clean`,
        );
        const text = `Inbox ${args.inbox_id} cleaned successfully.`;
        return { content: [{ type: "text" as const, text }] };
      }

      if (args.action === "mark_all_read") {
        await request<Record<string, unknown>>(
          "PATCH",
          `/api/accounts/${accountId}/inboxes/${args.inbox_id}/all_read`,
        );
        const text = `All messages in inbox ${args.inbox_id} marked as read.`;
        return { content: [{ type: "text" as const, text }] };
      }

      if (args.action === "reset_credentials") {
        const data = await request<Record<string, unknown>>(
          "PATCH",
          `/api/accounts/${accountId}/inboxes/${args.inbox_id}/reset_credentials`,
        );
        const text = JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      }

      await request<undefined>(
        "DELETE",
        `/api/accounts/${accountId}/inboxes/${args.inbox_id}`,
      );
      const text = `Inbox ${args.inbox_id} deleted successfully.`;
      return { content: [{ type: "text" as const, text }] };
    },
  );

  readTool(
    server,
    "get_messages",
    "List messages in a sandbox inbox.",
    {
      inbox_id: z.number().describe("Inbox ID"),
      search: z.string().optional().describe("Search query"),
      page: z.number().optional().describe("Page number"),
      last_id: z
        .number()
        .optional()
        .describe("Last message ID for cursor-based pagination"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const query: Record<string, string | number | undefined> = {};
      if (args.search) query.search = args.search;
      if (args.page) query.page = args.page;
      if (args.last_id) query.last_id = args.last_id;

      const data = await request<Record<string, unknown>[]>(
        "GET",
        `/api/accounts/${accountId}/inboxes/${args.inbox_id}/messages`,
        { query },
      );

      const rows = data.map((msg) => ({
        id: msg.id,
        subject: msg.subject,
        from_email: msg.from_email,
        to_email: msg.to_email,
        is_read: msg.is_read,
        sent_at: msg.sent_at,
      }));

      const text = formatTable(rows, "Messages");
      return { content: [{ type: "text" as const, text }] };
    },
  );

  readTool(
    server,
    "get_message",
    "Get a single sandbox message with body content and optional attachments.",
    {
      inbox_id: z.number().describe("Inbox ID"),
      message_id: z.number().describe("Message ID"),
      format: z
        .enum(["html", "text", "raw", "htmlsource", "eml"])
        .optional()
        .default("html")
        .describe("Body format (default html)"),
      include_attachments: z.boolean().optional().describe("Include list of attachments"),
      attachment_id: z.number().optional().describe("Get a specific attachment by ID"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const basePath = `/api/accounts/${accountId}/inboxes/${args.inbox_id}/messages/${args.message_id}`;

      const [metadata, body] = await Promise.all([
        request<Record<string, unknown>>("GET", basePath),
        requestText("GET", `${basePath}/body.${args.format}`),
      ]);

      const parts: string[] = [];

      parts.push("── Metadata ──");
      parts.push(JSON.stringify(metadata, null, 2));

      parts.push("");
      parts.push(`── Body (${args.format}) ──`);
      parts.push(typeof body === "string" ? body : JSON.stringify(body, null, 2));

      if (args.include_attachments) {
        const attachments = await request<Record<string, unknown>[]>(
          "GET",
          `${basePath}/attachments`,
        );
        parts.push("");
        parts.push("── Attachments ──");
        parts.push(JSON.stringify(attachments, null, 2));
      }

      if (args.attachment_id) {
        const attachment = await request<Record<string, unknown>>(
          "GET",
          `${basePath}/attachments/${args.attachment_id}`,
        );
        parts.push("");
        parts.push(`── Attachment ${args.attachment_id} ──`);
        parts.push(JSON.stringify(attachment, null, 2));
      }

      const text = parts.join("\n");
      return { content: [{ type: "text" as const, text }] };
    },
  );

  readTool(
    server,
    "analyze_message",
    "Analyze a sandbox message: spam report, HTML analysis, and mail headers.",
    {
      inbox_id: z.number().describe("Inbox ID"),
      message_id: z.number().describe("Message ID"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const basePath = `/api/accounts/${accountId}/inboxes/${args.inbox_id}/messages/${args.message_id}`;

      const [spamReport, htmlAnalysis, mailHeaders] = await Promise.all([
        request<Record<string, unknown>>("GET", `${basePath}/spam_report`),
        request<Record<string, unknown>>("GET", `${basePath}/analyze`),
        request<Record<string, unknown>>("GET", `${basePath}/mail_headers`),
      ]);

      const parts: string[] = [];

      parts.push("── Spam Report ──");
      parts.push(JSON.stringify(spamReport, null, 2));

      parts.push("");
      parts.push("── HTML Analysis ──");
      parts.push(JSON.stringify(htmlAnalysis, null, 2));

      parts.push("");
      parts.push("── Mail Headers ──");
      parts.push(JSON.stringify(mailHeaders, null, 2));

      const text = parts.join("\n");
      return { content: [{ type: "text" as const, text }] };
    },
  );

  writeTool(
    server,
    "forward_message",
    "Forward a sandbox message to an email address.",
    {
      inbox_id: z.number().describe("Inbox ID"),
      message_id: z.number().describe("Message ID"),
      email: z.string().describe("Email address to forward to"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      await request<Record<string, unknown>>(
        "POST",
        `/api/accounts/${accountId}/inboxes/${args.inbox_id}/messages/${args.message_id}/forward`,
        { body: { email: args.email } },
      );
      const text = `Message ${args.message_id} forwarded to ${args.email} successfully.`;
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
