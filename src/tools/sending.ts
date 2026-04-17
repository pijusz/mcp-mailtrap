import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getEnv } from "../config/env.ts";
import { request } from "../services/mailtrap-api.ts";
import { writeTool } from "../utils/register-tool.ts";

const recipientSchema = z.object({
  email: z.string().describe("Email address"),
  name: z.string().optional().describe("Display name"),
});

const streamSchema = z
  .enum(["transactional", "bulk"])
  .describe("Sending stream (transactional or bulk)");

const attachmentSchema = z.object({
  content: z.string().describe("Base64-encoded file content"),
  filename: z.string().describe("Filename with extension"),
  type: z.string().optional().describe("MIME type (e.g. application/pdf)"),
  disposition: z
    .enum(["attachment", "inline"])
    .optional()
    .describe("Attachment disposition (default: attachment)"),
  content_id: z.string().optional().describe("Content ID for inline attachments"),
});

const batchBaseSchema = z.object({
  from_email: z.string().optional().describe("Shared sender email"),
  from_name: z.string().optional().describe("Shared sender name"),
  subject: z.string().optional().describe("Shared subject"),
  html: z.string().optional().describe("Shared HTML body"),
  text: z.string().optional().describe("Shared plain-text body"),
  template_uuid: z.string().optional().describe("Shared template UUID"),
  template_variables: z
    .record(z.string(), z.string())
    .optional()
    .describe("Shared template variables"),
  category: z.string().optional().describe("Shared category"),
  custom_variables: z
    .record(z.string(), z.string())
    .optional()
    .describe("Shared custom variables"),
  headers: z.record(z.string(), z.string()).optional().describe("Shared custom headers"),
});

const batchRequestSchema = z.object({
  from_email: z.string().optional().describe("Sender email"),
  from_name: z.string().optional().describe("Sender name"),
  to: z.array(recipientSchema).optional().describe("To recipients"),
  cc: z.array(recipientSchema).optional().describe("CC recipients"),
  bcc: z.array(recipientSchema).optional().describe("BCC recipients"),
  subject: z.string().optional().describe("Subject"),
  html: z.string().optional().describe("HTML body"),
  text: z.string().optional().describe("Plain-text body"),
  template_uuid: z.string().optional().describe("Template UUID"),
  template_variables: z
    .record(z.string(), z.string())
    .optional()
    .describe("Template variables"),
  category: z.string().optional().describe("Category"),
  custom_variables: z
    .record(z.string(), z.string())
    .optional()
    .describe("Custom variables"),
  headers: z.record(z.string(), z.string()).optional().describe("Custom headers"),
});

type BatchRequest = z.infer<typeof batchRequestSchema>;

export function registerSendingTools(server: McpServer): void {
  writeTool(
    server,
    "send_email",
    "Send a single email via a transactional or bulk stream. Provide html/text body or a template_uuid.",
    {
      stream: streamSchema,
      from_email: z
        .string()
        .optional()
        .describe("Sender email (falls back to MAILTRAP_DEFAULT_FROM_EMAIL env var)"),
      from_name: z.string().optional().describe("Sender display name"),
      to: z.array(recipientSchema).describe("To recipients"),
      cc: z.array(recipientSchema).optional().describe("CC recipients"),
      bcc: z.array(recipientSchema).optional().describe("BCC recipients"),
      subject: z
        .string()
        .optional()
        .describe("Email subject (required unless template_uuid is set)"),
      html: z.string().optional().describe("HTML body"),
      text: z.string().optional().describe("Plain-text body"),
      template_uuid: z
        .string()
        .optional()
        .describe("Template UUID to use instead of inline body"),
      template_variables: z
        .record(z.string(), z.string())
        .optional()
        .describe("Variables to inject into the template"),
      category: z.string().optional().describe("Email category for analytics"),
      custom_variables: z
        .record(z.string(), z.string())
        .optional()
        .describe("Custom variables attached to the message"),
      headers: z
        .record(z.string(), z.string())
        .optional()
        .describe("Custom email headers"),
      attachments: z
        .array(attachmentSchema)
        .optional()
        .describe("File attachments (base64-encoded)"),
    },
    async (args) => {
      const fromEmail = args.from_email ?? getEnv().MAILTRAP_DEFAULT_FROM_EMAIL;
      if (!fromEmail) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: from_email is required. Set it per-call or via MAILTRAP_DEFAULT_FROM_EMAIL env var.",
            },
          ],
          isError: true,
        };
      }

      const body: Record<string, unknown> = {
        from: { email: fromEmail, ...(args.from_name && { name: args.from_name }) },
        to: args.to,
      };

      if (args.cc) body.cc = args.cc;
      if (args.bcc) body.bcc = args.bcc;
      if (args.subject) body.subject = args.subject;
      if (args.html) body.html = args.html;
      if (args.text) body.text = args.text;
      if (args.template_uuid) body.template_uuid = args.template_uuid;
      if (args.template_variables) body.template_variables = args.template_variables;
      if (args.category) body.category = args.category;
      if (args.custom_variables) body.custom_variables = args.custom_variables;
      if (args.headers) body.headers = args.headers;
      if (args.attachments) body.attachments = args.attachments;

      const data = await request<{ success: boolean; message_ids: string[] }>(
        "POST",
        "/api/send",
        { body, stream: args.stream },
      );

      const text = [
        "Email sent successfully.",
        `Message IDs: ${data.message_ids.join(", ")}`,
      ].join("\n");

      return { content: [{ type: "text" as const, text }] };
    },
  );

  writeTool(
    server,
    "batch_send",
    "Send up to 500 emails in a single batch request via a transactional or bulk stream.",
    {
      stream: streamSchema,
      base: batchBaseSchema
        .optional()
        .describe("Shared properties applied to every email in the batch"),
      requests: z
        .array(batchRequestSchema)
        .describe(
          "Array of individual email objects (each needs at least one of to/cc/bcc)",
        ),
    },
    async (args) => {
      const batchBody: Record<string, unknown> = {};

      if (args.base) {
        const base: Record<string, unknown> = {};
        if (args.base.from_email) {
          base.from = {
            email: args.base.from_email,
            ...(args.base.from_name && { name: args.base.from_name }),
          };
        }
        if (args.base.subject) base.subject = args.base.subject;
        if (args.base.html) base.html = args.base.html;
        if (args.base.text) base.text = args.base.text;
        if (args.base.template_uuid) base.template_uuid = args.base.template_uuid;
        if (args.base.template_variables)
          base.template_variables = args.base.template_variables;
        if (args.base.category) base.category = args.base.category;
        if (args.base.custom_variables)
          base.custom_variables = args.base.custom_variables;
        if (args.base.headers) base.headers = args.base.headers;
        batchBody.base = base;
      }

      batchBody.requests = args.requests.map((req: BatchRequest) => {
        const item: Record<string, unknown> = {};
        if (req.from_email) {
          item.from = {
            email: req.from_email,
            ...(req.from_name && { name: req.from_name }),
          };
        }
        if (req.to) item.to = req.to;
        if (req.cc) item.cc = req.cc;
        if (req.bcc) item.bcc = req.bcc;
        if (req.subject) item.subject = req.subject;
        if (req.html) item.html = req.html;
        if (req.text) item.text = req.text;
        if (req.template_uuid) item.template_uuid = req.template_uuid;
        if (req.template_variables) item.template_variables = req.template_variables;
        if (req.category) item.category = req.category;
        if (req.custom_variables) item.custom_variables = req.custom_variables;
        if (req.headers) item.headers = req.headers;
        return item;
      });

      const data = await request<{ success: boolean; responses: unknown[] }>(
        "POST",
        "/api/batch",
        { body: batchBody, stream: args.stream },
      );

      const text = [
        "Batch sent successfully.",
        `Responses: ${data.responses.length}`,
        JSON.stringify(data.responses, null, 2),
      ].join("\n");

      return { content: [{ type: "text" as const, text }] };
    },
  );

  writeTool(
    server,
    "send_test_email",
    "Send a test email to a sandbox inbox for development/testing.",
    {
      inbox_id: z
        .number()
        .optional()
        .describe("Sandbox inbox ID (falls back to MAILTRAP_TEST_INBOX_ID env var)"),
      from_email: z
        .string()
        .optional()
        .describe("Sender email (falls back to MAILTRAP_DEFAULT_FROM_EMAIL env var)"),
      from_name: z.string().optional().describe("Sender display name"),
      to: z.array(recipientSchema).describe("To recipients"),
      subject: z.string().optional().describe("Email subject"),
      html: z.string().optional().describe("HTML body"),
      text: z.string().optional().describe("Plain-text body"),
      template_uuid: z
        .string()
        .optional()
        .describe("Template UUID to use instead of inline body"),
      template_variables: z
        .record(z.string(), z.string())
        .optional()
        .describe("Variables to inject into the template"),
    },
    async (args) => {
      const env = getEnv();
      const inboxId =
        args.inbox_id ??
        (env.MAILTRAP_TEST_INBOX_ID ? Number(env.MAILTRAP_TEST_INBOX_ID) : undefined);
      if (!inboxId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: inbox_id is required. Set it per-call or via MAILTRAP_TEST_INBOX_ID env var.",
            },
          ],
          isError: true,
        };
      }

      const fromEmail = args.from_email ?? env.MAILTRAP_DEFAULT_FROM_EMAIL;
      if (!fromEmail) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: from_email is required. Set it per-call or via MAILTRAP_DEFAULT_FROM_EMAIL env var.",
            },
          ],
          isError: true,
        };
      }

      const body: Record<string, unknown> = {
        from: { email: fromEmail, ...(args.from_name && { name: args.from_name }) },
        to: args.to,
      };

      if (args.subject) body.subject = args.subject;
      if (args.html) body.html = args.html;
      if (args.text) body.text = args.text;
      if (args.template_uuid) body.template_uuid = args.template_uuid;
      if (args.template_variables) body.template_variables = args.template_variables;

      const data = await request<{ success: boolean; message_ids: string[] }>(
        "POST",
        `/api/send/${inboxId}`,
        { body, stream: "sandbox" },
      );

      const text = [
        "Test email sent successfully.",
        `Message IDs: ${data.message_ids.join(", ")}`,
      ].join("\n");

      return { content: [{ type: "text" as const, text }] };
    },
  );
}
