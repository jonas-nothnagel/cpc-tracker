import { describe, expect, it } from "vitest";
import { POST } from "./route";

function jsonRequest(body: string): Request {
  return new Request("http://localhost/api/coherence-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/coherence-chat input caps", () => {
  it("rejects an oversized body (> 2 MB) with 413", async () => {
    const huge = "x".repeat(2 * 1024 * 1024 + 16);
    const res = await POST(jsonRequest(huge));
    expect(res.status).toBe(413);
  });

  it("rejects an over-long query with 413", async () => {
    const body = JSON.stringify({ query: "a".repeat(5000) });
    const res = await POST(jsonRequest(body));
    expect(res.status).toBe(413);
  });

  it("rejects an empty query with 400", async () => {
    const res = await POST(jsonRequest(JSON.stringify({ query: "   " })));
    expect(res.status).toBe(400);
  });
});
