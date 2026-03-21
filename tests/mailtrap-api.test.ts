import { beforeEach, describe, expect, it, mock } from "bun:test";

// Mock fetch globally before importing the module
const mockFetch = mock(() =>
  Promise.resolve(
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ),
);
globalThis.fetch = mockFetch as unknown as typeof fetch;

// Set required env before importing
process.env.MAILTRAP_API_TOKEN = "test-token-123";
process.env.MAILTRAP_SENDING_TOKEN = "sending-token-456";

const { request, requestText, fetchWithRetry } = await import(
  "../src/services/mailtrap-api.ts"
);

describe("mailtrap-api", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("request", () => {
    it("parses JSON responses", async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 1, name: "test" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );

      const result = await request<{ id: number; name: string }>("GET", "/api/accounts");
      expect(result).toEqual({ id: 1, name: "test" });
    });

    it("returns raw text for non-JSON responses", async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve(
          new Response("<html><body>Hello</body></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        ),
      );

      const result = await request<string>("GET", "/api/test");
      expect(result).toBe("<html><body>Hello</body></html>");
    });

    it("returns undefined for 204 No Content", async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve(new Response(null, { status: 204 })),
      );

      const result = await request<void>("DELETE", "/api/test/1");
      expect(result).toBeUndefined();
    });

    it("routes to correct base URL for transactional stream", async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );

      await request("POST", "/api/send", {
        stream: "transactional",
        body: {},
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toStartWith("https://send.api.mailtrap.io");
    });

    it("routes to correct base URL for bulk stream", async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );

      await request("POST", "/api/send", { stream: "bulk", body: {} });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toStartWith("https://bulk.api.mailtrap.io");
    });

    it("routes to sandbox base URL", async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );

      await request("POST", "/api/send/123", {
        stream: "sandbox",
        body: {},
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toStartWith("https://sandbox.api.mailtrap.io");
    });

    it("routes general API to mailtrap.io", async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );

      await request("GET", "/api/accounts");

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toStartWith("https://mailtrap.io");
    });

    it("uses the general auth header for general API requests", async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );

      await request("GET", "/api/test");

      const calledInit = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = calledInit.headers as Record<string, string>;
      expect(headers["Api-Token"]).toBe("test-token-123");
    });

    it("uses the sending token for transactional send requests", async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );

      await request("POST", "/api/send", {
        stream: "transactional",
        body: {},
      });

      const calledInit = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = calledInit.headers as Record<string, string>;
      expect(headers["Api-Token"]).toBe("sending-token-456");
    });

    it("keeps using the general token for sandbox requests", async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );

      await request("POST", "/api/send/123", {
        stream: "sandbox",
        body: {},
      });

      const calledInit = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = calledInit.headers as Record<string, string>;
      expect(headers["Api-Token"]).toBe("test-token-123");
    });

    it("throws on 401", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
          }),
        ),
      );

      expect(request("GET", "/api/test")).rejects.toThrow("401");
    });

    it("builds query string correctly", async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );

      await request("GET", "/api/test", {
        query: { start_date: "2025-01-01", end_date: "2025-01-31" },
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("start_date=2025-01-01");
      expect(calledUrl).toContain("end_date=2025-01-31");
    });
  });

  describe("requestText", () => {
    it("returns raw text without parsing", async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve(
          new Response("Plain text email body", {
            status: 200,
            headers: { "content-type": "text/plain" },
          }),
        ),
      );

      const result = await requestText("GET", "/api/test/body.txt");
      expect(result).toBe("Plain text email body");
    });

    it("returns HTML without parsing", async () => {
      const htmlContent = "<html><body><h1>Test</h1></body></html>";
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve(
          new Response(htmlContent, {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        ),
      );

      const result = await requestText("GET", "/api/test/body.html");
      expect(result).toBe(htmlContent);
    });
  });

  describe("fetchWithRetry", () => {
    it("retries on 429", async () => {
      let attempt = 0;
      mockFetch.mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          return Promise.resolve(new Response("Rate limited", { status: 429 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        );
      });

      const response = await fetchWithRetry(
        "https://mailtrap.io/api/test",
        { method: "GET", headers: {} },
        { retries: 2, delay: 10 },
      );

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("retries on 500", async () => {
      let attempt = 0;
      mockFetch.mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          return Promise.resolve(new Response("Server error", { status: 500 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        );
      });

      const response = await fetchWithRetry(
        "https://mailtrap.io/api/test",
        { method: "GET", headers: {} },
        { retries: 2, delay: 10 },
      );

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
