import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatTable } from "../services/format.ts";
import { request } from "../services/mailtrap-api.ts";
import { resolveAccountId } from "../utils/account-id.ts";

export function registerContactTools(server: McpServer): void {
  server.tool(
    "create_contact",
    "Create a new contact with an email address, optional custom fields, and optional list memberships.",
    {
      email: z.string().describe("Contact email address"),
      fields: z
        .record(z.unknown())
        .optional()
        .describe("Custom field values (key-value pairs)"),
      list_ids: z
        .array(z.number())
        .optional()
        .describe("IDs of contact lists to add this contact to"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const contact: Record<string, unknown> = { email: args.email };
      if (args.fields) contact.fields = args.fields;
      if (args.list_ids) contact.list_ids = args.list_ids;

      const data = await request<Record<string, unknown>>(
        "POST",
        `/api/accounts/${accountId}/contacts`,
        { body: { contact } },
      );
      const text = JSON.stringify(data, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "get_contact",
    "Get a contact by UUID or email address.",
    {
      identifier: z.string().describe("Contact UUID or email address"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const data = await request<Record<string, unknown>>(
        "GET",
        `/api/accounts/${accountId}/contacts/${args.identifier}`,
      );
      const text = JSON.stringify(data, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "update_contact",
    "Update a contact's email, custom fields, list memberships, or unsubscribed status.",
    {
      identifier: z.string().describe("Contact UUID or email address"),
      email: z.string().optional().describe("New email address"),
      fields: z.record(z.unknown()).optional().describe("Custom field values to update"),
      list_ids_included: z
        .array(z.number())
        .optional()
        .describe("List IDs to add the contact to"),
      list_ids_excluded: z
        .array(z.number())
        .optional()
        .describe("List IDs to remove the contact from"),
      unsubscribed: z
        .boolean()
        .optional()
        .describe("Set the contact's unsubscribed status"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const contact: Record<string, unknown> = {};
      if (args.email !== undefined) contact.email = args.email;
      if (args.fields !== undefined) contact.fields = args.fields;
      if (args.list_ids_included !== undefined)
        contact.list_ids_included = args.list_ids_included;
      if (args.list_ids_excluded !== undefined)
        contact.list_ids_excluded = args.list_ids_excluded;
      if (args.unsubscribed !== undefined) contact.unsubscribed = args.unsubscribed;

      const data = await request<Record<string, unknown>>(
        "PATCH",
        `/api/accounts/${accountId}/contacts/${args.identifier}`,
        { body: { contact } },
      );
      const text = JSON.stringify(data, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "delete_contact",
    "Delete a contact by UUID or email address.",
    {
      identifier: z.string().describe("Contact UUID or email address"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      await request<undefined>(
        "DELETE",
        `/api/accounts/${accountId}/contacts/${args.identifier}`,
      );
      const text = `Contact ${args.identifier} deleted successfully.`;
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "trigger_contact_event",
    "Trigger a custom event for a contact (used for automation workflows).",
    {
      identifier: z.string().describe("Contact UUID or email address"),
      event_name: z.string().describe("Name of the event to trigger"),
      params: z
        .record(z.unknown())
        .optional()
        .describe("Event parameters (key-value pairs)"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const body: Record<string, unknown> = { name: args.event_name };
      if (args.params) body.params = args.params;

      const data = await request<Record<string, unknown>>(
        "POST",
        `/api/accounts/${accountId}/contacts/${args.identifier}/events`,
        { body },
      );
      const text = JSON.stringify(data, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool("list_contact_lists", "List all contact lists.", {}, async () => {
    const accountId = await resolveAccountId();
    const data = await request<Record<string, unknown>[]>(
      "GET",
      `/api/accounts/${accountId}/contacts/lists`,
    );
    const rows = data.map((l) => ({
      id: l.id,
      name: l.name,
    }));
    const text = formatTable(rows, "Contact Lists");
    return { content: [{ type: "text" as const, text }] };
  });

  server.tool(
    "get_contact_list",
    "Get details of a single contact list.",
    {
      list_id: z.number().describe("Contact list ID"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const data = await request<Record<string, unknown>>(
        "GET",
        `/api/accounts/${accountId}/contacts/lists/${args.list_id}`,
      );
      const text = JSON.stringify(data, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "create_contact_list",
    "Create a new contact list.",
    {
      name: z.string().describe("Name of the contact list"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const data = await request<Record<string, unknown>>(
        "POST",
        `/api/accounts/${accountId}/contacts/lists`,
        { body: { name: args.name } },
      );
      const text = JSON.stringify(data, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "update_contact_list",
    "Rename an existing contact list.",
    {
      list_id: z.number().describe("Contact list ID"),
      name: z.string().describe("New name for the contact list"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const data = await request<Record<string, unknown>>(
        "PATCH",
        `/api/accounts/${accountId}/contacts/lists/${args.list_id}`,
        { body: { name: args.name } },
      );
      const text = JSON.stringify(data, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "delete_contact_list",
    "Delete a contact list.",
    {
      list_id: z.number().describe("Contact list ID"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      await request<undefined>(
        "DELETE",
        `/api/accounts/${accountId}/contacts/lists/${args.list_id}`,
      );
      const text = `Contact list ${args.list_id} deleted successfully.`;
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "manage_contact_field",
    "List, get, create, update, or delete custom contact fields.",
    {
      action: z
        .enum(["list", "get", "create", "update", "delete"])
        .describe("Action to perform"),
      field_id: z
        .number()
        .optional()
        .describe("Field ID (required for get, update, delete)"),
      name: z
        .string()
        .optional()
        .describe("Field name (required for create, optional for update)"),
      data_type: z
        .enum(["text", "integer", "float", "boolean", "date"])
        .optional()
        .describe("Field data type (required for create)"),
      merge_tag: z
        .string()
        .optional()
        .describe("Merge tag for the field (optional for create/update)"),
    },
    async (args) => {
      const accountId = await resolveAccountId();
      const basePath = `/api/accounts/${accountId}/contacts/fields`;

      switch (args.action) {
        case "list": {
          const data = await request<Record<string, unknown>[]>("GET", basePath);
          const text = formatTable(data, "Contact Fields");
          return { content: [{ type: "text" as const, text }] };
        }

        case "get": {
          const data = await request<Record<string, unknown>>(
            "GET",
            `${basePath}/${args.field_id}`,
          );
          const text = JSON.stringify(data, null, 2);
          return { content: [{ type: "text" as const, text }] };
        }

        case "create": {
          const body: Record<string, unknown> = {
            name: args.name,
            data_type: args.data_type,
          };
          if (args.merge_tag) body.merge_tag = args.merge_tag;

          const data = await request<Record<string, unknown>>("POST", basePath, { body });
          const text = JSON.stringify(data, null, 2);
          return { content: [{ type: "text" as const, text }] };
        }

        case "update": {
          const body: Record<string, unknown> = {};
          if (args.name !== undefined) body.name = args.name;
          if (args.merge_tag !== undefined) body.merge_tag = args.merge_tag;

          const data = await request<Record<string, unknown>>(
            "PATCH",
            `${basePath}/${args.field_id}`,
            { body },
          );
          const text = JSON.stringify(data, null, 2);
          return { content: [{ type: "text" as const, text }] };
        }

        case "delete": {
          await request<undefined>("DELETE", `${basePath}/${args.field_id}`);
          const text = `Contact field ${args.field_id} deleted successfully.`;
          return { content: [{ type: "text" as const, text }] };
        }
      }
    },
  );

  server.tool(
    "import_contacts",
    "Start a contact import or check the status of an existing import.",
    {
      contacts: z
        .array(
          z.object({
            email: z.string().describe("Contact email address"),
            fields: z.record(z.unknown()).optional().describe("Custom field values"),
            list_ids_included: z
              .array(z.number())
              .optional()
              .describe("List IDs to add the contact to"),
            list_ids_excluded: z
              .array(z.number())
              .optional()
              .describe("List IDs to remove the contact from"),
          }),
        )
        .optional()
        .describe("Array of contacts to import (provide this to start an import)"),
      import_id: z
        .number()
        .optional()
        .describe("Import ID to check status of an existing import"),
    },
    async (args) => {
      const accountId = await resolveAccountId();

      if (args.import_id !== undefined) {
        const data = await request<Record<string, unknown>>(
          "GET",
          `/api/accounts/${accountId}/contacts/imports/${args.import_id}`,
        );
        const text = JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      }

      if (args.contacts) {
        const data = await request<Record<string, unknown>>(
          "POST",
          `/api/accounts/${accountId}/contacts/imports`,
          { body: { contacts: args.contacts } },
        );
        const text = JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      }

      const text =
        "Please provide either 'contacts' to start an import or 'import_id' to check status.";
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "export_contacts",
    "Start a contact export or check the status of an existing export.",
    {
      filters: z
        .array(
          z.object({
            name: z.string().describe("Filter field name"),
            operator: z.string().describe("Filter operator"),
            value: z.string().describe("Filter value"),
          }),
        )
        .optional()
        .describe("Filters to apply to the export"),
      export_id: z
        .number()
        .optional()
        .describe("Export ID to check status of an existing export"),
    },
    async (args) => {
      const accountId = await resolveAccountId();

      if (args.export_id !== undefined) {
        const data = await request<Record<string, unknown>>(
          "GET",
          `/api/accounts/${accountId}/contacts/exports/${args.export_id}`,
        );
        const text = JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text }] };
      }

      const body: Record<string, unknown> = {};
      if (args.filters) body.filters = args.filters;

      const data = await request<Record<string, unknown>>(
        "POST",
        `/api/accounts/${accountId}/contacts/exports`,
        { body },
      );
      const text = JSON.stringify(data, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
