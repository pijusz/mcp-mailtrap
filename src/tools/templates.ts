import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createElement } from "react";
import { z } from "zod";
import { formatTable } from "../services/format.ts";
import { request } from "../services/mailtrap-api.ts";
import { resolveAccountId } from "../utils/account-id.ts";

export function registerTemplateTools(server: McpServer): void {
  server.tool("list_templates", "List all email templates.", {}, async () => {
    const accountId = await resolveAccountId();
    const data = await request<Record<string, unknown>[]>(
      "GET",
      `/api/accounts/${accountId}/email_templates`,
    );
    const rows = data.map((t) => ({
      id: t.id,
      uuid: t.uuid,
      name: t.name,
      subject: t.subject,
      category: t.category,
    }));
    const text = formatTable(rows, "Email Templates");
    return { content: [{ type: "text" as const, text }] };
  });

  server.tool(
    "get_template",
    "Get a single email template by ID.",
    {
      template_id: z.number().describe("Template ID"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const data = await request<Record<string, unknown>>(
        "GET",
        `/api/accounts/${accountId}/email_templates/${args.template_id}`,
      );
      const text = JSON.stringify(data, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "create_template",
    "Create a new email template. body_html is passed to Mailtrap as-is.",
    {
      name: z.string().describe("Template name"),
      subject: z.string().describe("Email subject"),
      category: z.string().describe("Template category"),
      body_html: z.string().describe("HTML body of the template"),
      body_text: z.string().optional().describe("Plain text body of the template"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const emailTemplate: Record<string, string> = {
        name: args.name,
        subject: args.subject,
        category: args.category,
        body_html: args.body_html,
      };
      if (args.body_text) {
        emailTemplate.body_text = args.body_text;
      }
      const data = await request<Record<string, unknown>>(
        "POST",
        `/api/accounts/${accountId}/email_templates`,
        { body: { email_template: emailTemplate } },
      );
      const text = JSON.stringify(data, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "update_template",
    "Update an existing email template.",
    {
      template_id: z.number().describe("Template ID"),
      name: z.string().optional().describe("Template name"),
      subject: z.string().optional().describe("Email subject"),
      category: z.string().optional().describe("Template category"),
      body_html: z.string().optional().describe("HTML body of the template"),
      body_text: z.string().optional().describe("Plain text body of the template"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const emailTemplate: Record<string, string> = {};
      if (args.name !== undefined) emailTemplate.name = args.name;
      if (args.subject !== undefined) emailTemplate.subject = args.subject;
      if (args.category !== undefined) emailTemplate.category = args.category;
      if (args.body_html !== undefined) emailTemplate.body_html = args.body_html;
      if (args.body_text !== undefined) emailTemplate.body_text = args.body_text;
      const data = await request<Record<string, unknown>>(
        "PATCH",
        `/api/accounts/${accountId}/email_templates/${args.template_id}`,
        { body: { email_template: emailTemplate } },
      );
      const text = JSON.stringify(data, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "delete_template",
    "Delete an email template.",
    {
      template_id: z.number().describe("Template ID"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      await request<undefined>(
        "DELETE",
        `/api/accounts/${accountId}/email_templates/${args.template_id}`,
      );
      const text = `Template ${args.template_id} deleted successfully.`;
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "render_react_email",
    "Render a react-email .tsx component file to HTML and plain text. Does NOT call any Mailtrap API — purely local rendering.",
    {
      file_path: z
        .string()
        .describe("Absolute path to a .tsx file exporting a default React component"),
    },
    async (args) => {
      try {
        const mod = await import(args.file_path);
        const Component = mod.default;
        if (!Component) {
          throw new Error(
            "The file does not export a default React component. Make sure your .tsx file has a default export.",
          );
        }
        const { render } = await import("@react-email/render");
        const html = await render(createElement(Component), { pretty: true });
        const plainText = await render(createElement(Component), { plainText: true });
        const text = JSON.stringify({ html, text: plainText }, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const text = `Error rendering react-email component: ${message}\n\nMake sure the file exports a default React component and that @react-email/render is installed.`;
        return { content: [{ type: "text" as const, text }] };
      }
    },
  );
}
