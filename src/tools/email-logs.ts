import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatTable } from "../services/format.ts";
import { request } from "../services/mailtrap-api.ts";
import { resolveAccountId } from "../utils/account-id.ts";
import { readTool, writeTool } from "../utils/register-tool.ts";

interface EmailLog {
  message_id: string;
  subject: string;
  to: string;
  from: string;
  status: string;
  sending_stream: string;
  sent_at: string;
  category?: string | null;
  opens_count?: number;
  clicks_count?: number;
  [key: string]: unknown;
}

interface EmailLogsResponse {
  messages: EmailLog[];
  total_count?: number;
  next_page_cursor?: string | null;
}

interface Suppression {
  id: string;
  email: string;
  type: string;
  created_at: string;
  sending_stream: string;
  domain_name?: string;
  [key: string]: unknown;
}

interface ContactList {
  id: number;
  name: string;
  contacts_count: number;
  [key: string]: unknown;
}

export function registerEmailLogTools(server: McpServer): void {
  readTool(
    server,
    "get_email_logs",
    "List sent email logs (newest first) with filters. Returns message_id, recipient, sender, subject, status, stream, category and sent time. Use get_email_log with a message_id for the full event timeline. Paginate by passing the returned cursor.",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .default(50)
        .describe("Max rows to show (default 50)"),
      status: z
        .enum(["delivered", "not_delivered", "enqueued", "opted_out"])
        .optional()
        .describe("Filter by delivery status"),
      sending_stream: z
        .enum(["transactional", "bulk"])
        .optional()
        .describe("Filter by sending stream"),
      sent_after: z
        .string()
        .optional()
        .describe(
          "Only emails sent after this time (ISO 8601, e.g. 2026-01-31T00:00:00Z)",
        ),
      sent_before: z
        .string()
        .optional()
        .describe("Only emails sent before this time (ISO 8601)"),
      to: z
        .string()
        .optional()
        .describe("Recipient address contains this text (case-insensitive)"),
      from: z
        .string()
        .optional()
        .describe("Sender address contains this text (case-insensitive)"),
      subject: z
        .string()
        .optional()
        .describe("Subject contains this text (case-insensitive)"),
      category: z.string().optional().describe("Exact email category"),
      cursor: z
        .string()
        .optional()
        .describe("Pagination cursor returned by a previous call (a message_id)"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const query: Record<string, string | number | undefined> = {};

      const equal = (field: string, value?: string) => {
        if (!value) return;
        query[`filters[${field}][operator]`] = "equal";
        query[`filters[${field}][value]`] = value;
      };
      const contains = (field: string, value?: string) => {
        if (!value) return;
        query[`filters[${field}][operator]`] = "ci_contain";
        query[`filters[${field}][value]`] = value;
      };

      equal("status", args.status);
      equal("sending_stream", args.sending_stream);
      equal("category", args.category);
      contains("to", args.to);
      contains("from", args.from);
      contains("subject", args.subject);
      if (args.sent_after) query["filters[sent_after]"] = args.sent_after;
      if (args.sent_before) query["filters[sent_before]"] = args.sent_before;
      if (args.cursor) query.search_after = args.cursor;

      const response = await request<EmailLogsResponse>(
        "GET",
        `/api/accounts/${accountId}/email_logs`,
        { query },
      );

      const messages = response.messages ?? [];
      // The API returns a fixed page size, so apply `limit` client-side.
      const page = messages.slice(0, args.limit);

      const rows = page.map((log) => ({
        message_id: log.message_id,
        to: log.to,
        from: log.from,
        subject: log.subject,
        status: log.status,
        stream: log.sending_stream,
        category: log.category ?? "",
        sent_at: log.sent_at,
      }));

      const total = response.total_count ?? messages.length;
      let text = formatTable(rows, `Email Logs (showing ${rows.length} of ${total})`);

      const nextCursor =
        page.length < messages.length
          ? page[page.length - 1]?.message_id
          : response.next_page_cursor;
      if (nextCursor) {
        text += `\n\nMore results available. Next page cursor: ${nextCursor}`;
      }

      return { content: [{ type: "text" as const, text }] };
    },
  );

  readTool(
    server,
    "get_email_log",
    "Get the full log for one sent message (from get_email_logs), including its delivery/open/click/bounce event timeline.",
    {
      message_id: z.string().describe("The message_id from get_email_logs"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const data = await request<Record<string, unknown>>(
        "GET",
        `/api/accounts/${accountId}/email_logs/${encodeURIComponent(args.message_id)}`,
      );

      const text = JSON.stringify(data, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  readTool(
    server,
    "get_suppressions",
    "List suppressed addresses (hard bounces, spam complaints, unsubscribes, manual imports) that Mailtrap will not send to. Returns the suppression id needed by delete_suppression.",
    {
      email: z
        .string()
        .optional()
        .describe("Only return the suppression for this exact address"),
      start_time: z
        .string()
        .optional()
        .describe("Filter suppressions created after this time (ISO 8601)"),
      end_time: z
        .string()
        .optional()
        .describe("Filter suppressions created before this time (ISO 8601)"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const query: Record<string, string | undefined> = {};

      if (args.email) query.email = args.email;
      if (args.start_time) query.start_time = args.start_time;
      if (args.end_time) query.end_time = args.end_time;

      const data = await request<Suppression[]>(
        "GET",
        `/api/accounts/${accountId}/suppressions`,
        { query },
      );

      const rows = data.map((s) => ({
        id: s.id,
        email: s.email,
        type: s.type,
        stream: s.sending_stream,
        domain: s.domain_name ?? "",
        created_at: s.created_at,
      }));

      const text = formatTable(rows, `Suppressions (${rows.length})`);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  writeTool(
    server,
    "delete_suppression",
    "Remove a suppression so Mailtrap will send to that address again. Get the id from get_suppressions. Only do this if the address is known to be valid and consenting.",
    {
      suppression_id: z.string().describe("Suppression id (UUID) from get_suppressions"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      await request(
        "DELETE",
        `/api/accounts/${accountId}/suppressions/${encodeURIComponent(args.suppression_id)}`,
      );

      const text = `Suppression ${args.suppression_id} deleted successfully.`;
      return { content: [{ type: "text" as const, text }] };
    },
  );

  readTool(
    server,
    "check_list_hygiene",
    "Cross-references suppressions against contacts to find suppressed emails still in your contact lists. Looks up each suppressed email as a contact and checks list membership. Returns overlaps with specific remediation actions.",
    {
      list_id: z
        .number()
        .optional()
        .describe("Check a specific contact list ID, or omit to check all lists"),
    },
    async (args) => {
      const accountId = await resolveAccountId();

      const [suppressions, contactLists] = await Promise.all([
        request<Suppression[]>("GET", `/api/accounts/${accountId}/suppressions`),
        request<ContactList[]>("GET", `/api/accounts/${accountId}/contacts/lists`),
      ]);

      const requestedList = args.list_id
        ? contactLists.find((list) => list.id === args.list_id)
        : undefined;
      const targetListIds = requestedList
        ? new Set([requestedList.id])
        : new Set(contactLists.map((l) => l.id));

      const listNameMap = new Map(contactLists.map((l) => [l.id, l.name]));

      if ((args.list_id && !requestedList) || targetListIds.size === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: args.list_id
                ? `No contact list found with ID ${args.list_id}.`
                : "No contact lists found.",
            },
          ],
        };
      }

      if (suppressions.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No suppressions found. All contact lists are clean.",
            },
          ],
        };
      }

      // Look up each suppressed email as a contact to find list membership
      interface ContactResult {
        email: string;
        list_ids: number[];
      }

      const overlaps: Array<{
        email: string;
        type: string;
        created_at: string;
        lists: Array<{ id: number; name: string }>;
      }> = [];

      let failedLookups = 0;

      // Batch lookups (max 10 concurrent to respect rate limits)
      const batchSize = 10;
      for (let i = 0; i < suppressions.length; i += batchSize) {
        const batch = suppressions.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map((s) =>
            request<{ data: ContactResult }>(
              "GET",
              `/api/accounts/${accountId}/contacts/${encodeURIComponent(s.email)}`,
            ),
          ),
        );

        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          const suppression = batch[j];
          // 404 just means the suppressed address is not a contact — expected.
          if (
            result.status === "rejected" &&
            !String(result.reason?.message ?? result.reason).includes("error 404")
          ) {
            failedLookups++;
          }
          if (result.status === "fulfilled" && result.value?.data?.list_ids) {
            const matchingLists = result.value.data.list_ids
              .filter((id) => targetListIds.has(id))
              .map((id) => ({
                id,
                name: listNameMap.get(id) ?? `List ${id}`,
              }));

            if (matchingLists.length > 0) {
              overlaps.push({
                email: suppression.email,
                type: suppression.type,
                created_at: suppression.created_at,
                lists: matchingLists,
              });
            }
          }
        }
      }

      const lines: string[] = [];
      lines.push("List Hygiene Report");
      lines.push("═".repeat(50));
      lines.push("");
      lines.push(`Suppressions checked: ${suppressions.length}`);
      lines.push(`Overlaps found: ${overlaps.length}`);
      if (failedLookups > 0) {
        lines.push(
          `Warning: ${failedLookups} contact lookups failed (likely rate limiting) — the report may be incomplete. Re-run later or pass list_id.`,
        );
      }
      lines.push("");

      if (overlaps.length === 0) {
        lines.push("No suppressed emails found in your contact lists. Lists are clean.");
      } else {
        lines.push("Suppressed emails still in contact lists:");
        lines.push("─".repeat(50));
        for (const overlap of overlaps) {
          lines.push(
            `  ${overlap.email} (${overlap.type}, suppressed ${overlap.created_at})`,
          );
          for (const list of overlap.lists) {
            lines.push(`    → in list "${list.name}" (ID: ${list.id})`);
          }
          lines.push("");
        }

        lines.push("Suggested Actions:");
        for (const overlap of overlaps) {
          const listIds = overlap.lists.map((l) => l.id).join(", ");
          lines.push(
            `  • update_contact(identifier: "${overlap.email}", list_ids_excluded: [${listIds}])`,
          );
          // Complaints and unsubscribes are consent signals: never lift those suppressions.
          const consentSignal = /complaint|spam|unsubscri/i.test(overlap.type);
          lines.push(
            consentSignal
              ? `    Reason: ${overlap.type} — remove from lists, keep suppression`
              : `    Reason: ${overlap.type} — remove from lists. If the address is valid again, also delete_suppression.`,
          );
        }
      }

      const text = lines.join("\n");
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
