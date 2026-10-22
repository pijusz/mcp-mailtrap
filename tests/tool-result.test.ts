import { describe, expect, it } from "bun:test";
import { errorResult, requireArgs } from "../src/utils/tool-result.ts";

process.env.MAILTRAP_API_TOKEN ??= "test-token";
const { errorHint } = await import("../src/services/mailtrap-api.ts");

describe("requireArgs", () => {
  it("returns null when all args are present", () => {
    expect(requireArgs({ a: 1, b: "x" }, ["a", "b"], "create")).toBeNull();
  });

  it("names a single missing arg", () => {
    const res = requireArgs({ a: 1 }, ["a", "inbox_id"], "delete");
    expect(res?.isError).toBe(true);
    expect(res?.content[0].text).toBe('Error: inbox_id is required for action "delete".');
  });

  it("treats empty strings as missing and pluralises", () => {
    const res = requireArgs({ name: "" }, ["project_id", "name"], "update");
    expect(res?.content[0].text).toContain("project_id and name are required");
  });
});

describe("errorResult", () => {
  it("prefixes Error and flags isError", () => {
    expect(errorResult("boom")).toEqual({
      content: [{ type: "text", text: "Error: boom" }],
      isError: true,
    });
  });
});

describe("errorHint", () => {
  it("points at the API token on 401", () => {
    expect(errorHint(401, "https://mailtrap.io/api/accounts")).toContain(
      "MAILTRAP_API_TOKEN",
    );
  });

  it("points at the sending token for send endpoints", () => {
    expect(errorHint(401, "https://send.api.mailtrap.io/api/send")).toContain(
      "MAILTRAP_SENDING_TOKEN",
    );
  });

  it("is empty for other statuses", () => {
    expect(errorHint(422, "https://mailtrap.io/api/accounts")).toBe("");
  });
});
