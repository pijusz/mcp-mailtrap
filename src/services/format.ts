/**
 * Format an array of objects as an aligned ASCII table.
 */
export function formatTable(rows: Record<string, unknown>[], title?: string): string {
  if (rows.length === 0) return title ? `${title}\n(no data)` : "(no data)";

  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)),
  );

  const header = keys.map((k, i) => k.padEnd(widths[i])).join("  ");
  const separator = widths.map((w) => "─".repeat(w)).join("──");
  const body = rows
    .map((row) => keys.map((k, i) => String(row[k] ?? "").padEnd(widths[i])).join("  "))
    .join("\n");

  const table = `${header}\n${separator}\n${body}`;
  return title ? `${title}\n${table}` : table;
}

/**
 * Format stats response with Metric | Count | Rate (%) columns.
 */
export function formatStats(stats: Record<string, number>, title?: string): string {
  const metrics = ["delivery", "bounce", "open", "click", "spam"];

  const rows = metrics
    .filter((m) => `${m}_count` in stats)
    .map((m) => ({
      Metric: m.charAt(0).toUpperCase() + m.slice(1),
      Count: stats[`${m}_count`],
      "Rate (%)": ((stats[`${m}_rate`] ?? 0) * 100).toFixed(1),
    }));

  return formatTable(rows, title);
}

/**
 * Format grouped stats (by domain, category, ESP, date).
 */
export function formatGroupedStats(
  groups: Array<Record<string, unknown>>,
  groupKey: string,
  title?: string,
): string {
  if (groups.length === 0) return title ? `${title}\n(no data)` : "(no data)";

  const sections = groups.map((group) => {
    const label = String(group[groupKey] ?? group.sending_domain_id ?? "Unknown");
    const stats = (group.stats ?? group) as Record<string, number>;
    return formatStats(stats, `  ${label}`);
  });

  const header = title ?? "Stats";
  return `${header}\n${"═".repeat(40)}\n${sections.join("\n\n")}`;
}

/**
 * Build date range helper — returns {from, to} as YYYY-MM-DD.
 */
export function dateRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

/**
 * Strip columns that are all zero/empty/null from rows.
 */
export function stripEmptyColumns(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (rows.length === 0) return rows;
  const keys = Object.keys(rows[0]);
  const emptyKeys = keys.filter((k) =>
    rows.every((r) => {
      const v = r[k];
      return v === null || v === undefined || v === "" || v === 0;
    }),
  );
  if (emptyKeys.length === 0) return rows;
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      if (!emptyKeys.includes(k)) out[k] = r[k];
    }
    return out;
  });
}
