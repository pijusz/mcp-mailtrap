import { extname } from "node:path";
import { pathToFileURL } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createElement } from "react";
import { z } from "zod";
import { formatTable } from "../services/format.ts";
import { request } from "../services/mailtrap-api.ts";
import { resolveAccountId } from "../utils/account-id.ts";

/** Import a component module, transpiling .tsx/.jsx via esbuild on Node. */
async function importComponentModule(filePath: string): Promise<Record<string, unknown>> {
  const ext = extname(filePath).toLowerCase();

  // Bun handles .tsx/.jsx natively; .js/.mjs work everywhere
  if (typeof globalThis.Bun !== "undefined" || ext === ".js" || ext === ".mjs") {
    return import(pathToFileURL(filePath).href);
  }

  // Node: bundle in memory via esbuild's JS API, import from data URL
  const { build } = await import("esbuild");
  const result = await build({
    entryPoints: [filePath],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    sourcemap: "inline",
    external: ["react", "react-dom", "@react-email/*"],
    loader: { ".ts": "ts", ".tsx": "tsx", ".jsx": "jsx" },
  });

  const code = result.outputFiles[0].text;
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(url);
}

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
    "Render a react-email component file (.tsx/.jsx/.js/.mjs) to HTML and plain text. Purely local — does NOT call any Mailtrap API. The file must default-export a React component using @react-email/components.",
    {
      file_path: z
        .string()
        .describe(
          "Absolute path to a component file exporting a default React component",
        ),
    },
    async (args) => {
      try {
        const mod = await importComponentModule(args.file_path);
        const Component = mod.default as React.FunctionComponent;
        if (!Component) {
          throw new Error("File does not have a default export.");
        }
        const { render } = await import("@react-email/render");
        const element = createElement(Component);
        const html = await render(element, { pretty: true });
        const plainText = await render(element, { plainText: true });
        const text = JSON.stringify({ html, text: plainText }, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error rendering component: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
