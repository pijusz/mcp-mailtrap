import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatGroupedStats, formatStats } from "../services/format.ts";
import { request } from "../services/mailtrap-api.ts";
import { resolveAccountId } from "../utils/account-id.ts";
import { readTool } from "../utils/register-tool.ts";

const GROUP_BY_PATHS: Record<string, string> = {
  domain: "domains",
  category: "categories",
  esp: "email_service_providers",
  date: "date",
};

const GROUP_BY_KEYS: Record<string, string> = {
  domain: "sending_domain_id",
  category: "category",
  esp: "email_service_provider",
  date: "date",
};

export function registerStatsTools(server: McpServer): void {
  readTool(
    server,
    "get_stats",
    "Get sending statistics (delivery, bounce, open, click, spam rates). Use group_by to break down by domain, category, ESP, or date.",
    {
      start_date: z.string().describe("Start date (YYYY-MM-DD)"),
      end_date: z.string().describe("End date (YYYY-MM-DD)"),
      group_by: z
        .enum(["domain", "category", "esp", "date"])
        .optional()
        .describe("Group results by dimension"),
      sending_domain_ids: z
        .array(z.number())
        .optional()
        .describe("Filter by sending domain IDs"),
      sending_streams: z
        .array(z.enum(["transactional", "bulk"]))
        .optional()
        .describe("Filter by sending stream"),
      categories: z.array(z.string()).optional().describe("Filter by email category"),
      email_service_providers: z
        .array(z.string())
        .optional()
        .describe("Filter by ESP (e.g. gmail, outlook)"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const query: Record<string, string | string[] | undefined> = {
        start_date: args.start_date,
        end_date: args.end_date,
      };

      if (args.sending_domain_ids) {
        query.sending_domain_ids = args.sending_domain_ids.map(String);
      }
      if (args.sending_streams) {
        query.sending_streams = args.sending_streams;
      }
      if (args.categories) {
        query.categories = args.categories;
      }
      if (args.email_service_providers) {
        query.email_service_providers = args.email_service_providers;
      }

      if (args.group_by) {
        const pathSuffix = GROUP_BY_PATHS[args.group_by];
        const groupKey = GROUP_BY_KEYS[args.group_by];
        const data = await request<Record<string, unknown>[]>(
          "GET",
          `/api/accounts/${accountId}/stats/${pathSuffix}`,
          { query },
        );
        const title = `Stats by ${args.group_by} (${args.start_date} → ${args.end_date})`;
        const text = formatGroupedStats(data, groupKey, title);
        return { content: [{ type: "text" as const, text }] };
      }

      const data = await request<Record<string, number>>(
        "GET",
        `/api/accounts/${accountId}/stats`,
        { query },
      );
      const title = `Sending Stats (${args.start_date} → ${args.end_date})`;
      const text = formatStats(data, title);
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
