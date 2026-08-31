import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// next-intl's ESM middleware build imports "next/server" in a way vitest can't
// resolve; the intl handler isn't exercised by these auth/static paths, so mock it.
vi.mock("next-intl/middleware", () => ({
  default: () => () => NextResponse.next(),
}));

const { default: proxy } = await import("./proxy");

const TOKEN = "test-token-xyz";

function req(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), init);
}

describe("proxy auth gate", () => {
  const orig = process.env.APP_ACCESS_TOKEN;
  beforeEach(() => {
    process.env.APP_ACCESS_TOKEN = TOKEN;
  });
  afterEach(() => {
    process.env.APP_ACCESS_TOKEN = orig;
  });

  it("gates a dotted dynamic API segment — vuln-0001 regression", async () => {
    // A dot in a dynamic segment must NOT bypass the gate.
    expect((await proxy(req("/api/ratings/us.test"))).status).toBe(401);
    expect((await proxy(req("/api/analyze/test.id/status"))).status).toBe(401);
  });

  it("gates normal API paths", async () => {
    expect((await proxy(req("/api/sustainability"))).status).toBe(401);
  });

  it("redirects an unauthenticated page (incl. dotted) to /login", async () => {
    const res = await proxy(req("/en/analysis/test.id"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("passes static assets through without auth", async () => {
    expect((await proxy(req("/undp-logo.png"))).status).toBe(200);
  });

  it("allows an authenticated API request through the gate", async () => {
    const res = await proxy(
      req("/api/sustainability", { headers: { authorization: `Bearer ${TOKEN}` } }),
    );
    expect(res.status).not.toBe(401);
  });

  it("leaves the public health + auth endpoints open", async () => {
    expect((await proxy(req("/api/health"))).status).not.toBe(401);
  });
});
