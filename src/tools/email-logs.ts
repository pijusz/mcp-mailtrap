import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatTable } from "../services/format.ts";
import { request } from "../services/mailtrap-api.ts";
import { resolveAccountId } from "../utils/account-id.ts";

interface EmailLog {
  message_id: string;
  subject: string;
  to_email: string;
  from_email: string;
  status: string;
  sending_stream: string;
  sent_at: string;
  [key: string]: unknown;
}

interface EmailLogsResponse {
  data: EmailLog[];
  next_page_cursor?: string;
}

interface Suppression {
  id: string;
  email: string;
  reason: string;
  created_at: string;
  sending_stream: string;
  [key: string]: unknown;
}

interface ContactList {
  id: number;
  name: string;
  contacts_count: number;
  [key: string]: unknown;
}

export function registerEmailLogTools(server: McpServer): void {
  server.tool(
    "get_email_logs",
    "List sent email logs with filtering and cursor-based pagination.",
    {
      limit: z
        .number()
        .optional()
        .default(50)
        .describe("Number of results to return (default 50)"),
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
        .describe("Filter emails sent after this date (ISO 8601)"),
      sent_before: z
        .string()
        .optional()
        .describe("Filter emails sent before this date (ISO 8601)"),
      search: z.string().optional().describe("Search by subject, to, or from email"),
      cursor: z
        .string()
        .optional()
        .describe("Cursor for pagination (from next_page_cursor)"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const query: Record<string, string | number | undefined> = {
        limit: args.limit,
      };

      if (args.status) query["filter[status]"] = args.status;
      if (args.sending_stream) query["filter[sending_stream]"] = args.sending_stream;
      if (args.sent_after) query["filter[sent_after]"] = args.sent_after;
      if (args.sent_before) query["filter[sent_before]"] = args.sent_before;
      if (args.search) query["filter[search]"] = args.search;
      if (args.cursor) query.search_after = args.cursor;

      const response = await request<EmailLogsResponse>(
        "GET",
        `/api/accounts/${accountId}/email_logs`,
        { query },
      );

      const rows = response.data.map((log) => ({
        message_id: log.message_id,
        to: log.to_email,
        from: log.from_email,
        subject: log.subject,
        status: log.status,
        stream: log.sending_stream,
        sent_at: log.sent_at,
      }));

      let text = formatTable(rows, "Email Logs");

      if (response.next_page_cursor) {
        text += `\n\nNext page cursor: ${response.next_page_cursor}`;
      }

      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "get_email_log",
    "Get detailed log for a single message including delivery events.",
    {
      message_id: z.string().describe("The message ID to look up"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const data = await request<Record<string, unknown>>(
        "GET",
        `/api/accounts/${accountId}/email_logs/${args.message_id}`,
      );

      const text = JSON.stringify(data, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "get_suppressions",
    "List suppressed email addresses.",
    {
      email: z.string().optional().describe("Filter by email address"),
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

      if (args.email) query["filter[email]"] = args.email;
      if (args.start_time) query["filter[start_time]"] = args.start_time;
      if (args.end_time) query["filter[end_time]"] = args.end_time;

      const data = await request<Suppression[]>(
        "GET",
        `/api/accounts/${accountId}/suppressions`,
        { query },
      );

      const rows = data.map((s) => ({
        email: s.email,
        reason: s.reason,
        created_at: s.created_at,
        sending_stream: s.sending_stream,
      }));

      const text = formatTable(rows, "Suppressions");
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "delete_suppression",
    "Remove a suppression to allow sending to the email address again.",
    {
      suppression_id: z.string().describe("The suppression ID to delete"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      await request(
        "DELETE",
        `/api/accounts/${accountId}/suppressions/${args.suppression_id}`,
      );

      const text = `Suppression ${args.suppression_id} deleted successfully.`;
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
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
        reason: string;
        created_at: string;
        lists: Array<{ id: number; name: string }>;
      }> = [];

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
                reason: suppression.reason,
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
      lines.push("");

      if (overlaps.length === 0) {
        lines.push("No suppressed emails found in your contact lists. Lists are clean.");
      } else {
        lines.push("Suppressed emails still in contact lists:");
        lines.push("─".repeat(50));
        for (const overlap of overlaps) {
          lines.push(
            `  ${overlap.email} (${overlap.reason}, suppressed ${overlap.created_at})`,
          );
          for (const list of overlap.lists) {
            lines.push(`    → in list "${list.name}" (ID: ${list.id})`);
          }
          lines.push("");
        }

        lines.push("Suggested Actions:");
        for (const overlap of overlaps) {
          if (overlap.reason === "complaint" || overlap.reason === "unsubscribe") {
            lines.push(
              `  • update_contact(identifier: "${overlap.email}", list_ids_excluded: [${overlap.lists.map((l) => l.id).join(", ")}])`,
            );
            lines.push(
              `    Reason: ${overlap.reason} — remove from lists, keep suppression`,
            );
          } else {
            lines.push(
              `  • update_contact(identifier: "${overlap.email}", list_ids_excluded: [${overlap.lists.map((l) => l.id).join(", ")}])`,
            );
            lines.push(
              `    Reason: ${overlap.reason} — remove from lists. If email is valid, also delete_suppression.`,
            );
          }
        }
      }

      const text = lines.join("\n");
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
