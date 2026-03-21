import { describe, expect, it } from "bun:test";
import {
  dateRange,
  formatGroupedStats,
  formatStats,
  formatTable,
  stripEmptyColumns,
} from "../src/services/format.ts";

describe("formatTable", () => {
  it("formats rows as aligned table", () => {
    const rows = [
      { Name: "Alice", Age: 30 },
      { Name: "Bob", Age: 25 },
    ];
    const result = formatTable(rows);
    expect(result).toContain("Name");
    expect(result).toContain("Age");
    expect(result).toContain("Alice");
    expect(result).toContain("Bob");
    expect(result).toContain("30");
  });

  it("returns no data for empty array", () => {
    expect(formatTable([])).toBe("(no data)");
  });

  it("includes title when provided", () => {
    const result = formatTable([{ A: 1 }], "My Title");
    expect(result).toStartWith("My Title\n");
  });
});

describe("formatStats", () => {
  it("converts rates to percentages", () => {
    const stats = {
      delivery_count: 100,
      delivery_rate: 0.95,
      bounce_count: 5,
      bounce_rate: 0.05,
      open_count: 50,
      open_rate: 0.5,
      click_count: 10,
      click_rate: 0.1,
      spam_count: 1,
      spam_rate: 0.01,
    };
    const result = formatStats(stats);
    expect(result).toContain("95.0");
    expect(result).toContain("5.0");
    expect(result).toContain("50.0");
    expect(result).toContain("10.0");
    expect(result).toContain("1.0");
  });

  it("handles missing metrics", () => {
    const stats = { delivery_count: 100, delivery_rate: 1.0 };
    const result = formatStats(stats);
    expect(result).toContain("Delivery");
    expect(result).not.toContain("Bounce");
  });
});

describe("formatGroupedStats", () => {
  it("formats multiple groups", () => {
    const groups = [
      { category: "marketing", stats: { delivery_count: 100, delivery_rate: 0.9 } },
      { category: "transactional", stats: { delivery_count: 200, delivery_rate: 0.95 } },
    ];
    const result = formatGroupedStats(groups, "category", "By Category");
    expect(result).toContain("marketing");
    expect(result).toContain("transactional");
    expect(result).toContain("By Category");
  });

  it("returns no data for empty groups", () => {
    expect(formatGroupedStats([], "key", "Title")).toBe("Title\n(no data)");
  });
});

describe("dateRange", () => {
  it("returns from and to dates", () => {
    const { from, to } = dateRange(7);
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(to).getTime()).toBeGreaterThan(new Date(from).getTime());
  });
});

describe("stripEmptyColumns", () => {
  it("removes all-zero columns", () => {
    const rows = [
      { a: 1, b: 0, c: "hello" },
      { a: 2, b: 0, c: "world" },
    ];
    const result = stripEmptyColumns(rows);
    expect(result[0]).toHaveProperty("a");
    expect(result[0]).toHaveProperty("c");
    expect(result[0]).not.toHaveProperty("b");
  });

  it("keeps columns with at least one value", () => {
    const rows = [
      { a: 1, b: 0 },
      { a: 2, b: 5 },
    ];
    const result = stripEmptyColumns(rows);
    expect(result[0]).toHaveProperty("b");
  });

  it("returns empty array as-is", () => {
    expect(stripEmptyColumns([])).toEqual([]);
  });
});
