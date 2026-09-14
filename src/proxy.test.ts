import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// next-intl's ESM middleware build imports "next/server" in a way vitest can't
// resolve; the intl handler isn't exercised by these auth/static paths, so mock it.
vi.mock("next-intl/middleware", () => ({
  default: () => () => NextResponse.next(),
}));

const { default: proxy, isGatedPath } = await import("./proxy");

const TOKEN = "test-token-xyz";

function req(
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), init);
}

describe("isGatedPath", () => {
  it("covers the upload wizard in every locale and country variant", () => {
    for (const p of [
      "/upload",
      "/upload/",
      "/es/upload",
      "/mn/upload",
      "/panama/upload",
      "/es/panama/upload",
    ]) {
      expect(isGatedPath(p), p).toBe(true);
    }
  });

  it("covers the upload API routes", () => {
    for (const p of [
      "/api/extract",
      "/api/parse-btr",
      "/api/parse-excel-targets",
      "/api/analyze",
      "/api/analyze/",
      "/api/extraction-review",
    ]) {
      expect(isGatedPath(p), p).toBe(true);
    }
  });

  it("leaves everything else open", () => {
    for (const p of [
      "/",
      "/es",
      "/mongolia",
      "/es/panama",
      "/en/analysis/3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13",
      "/analytics",
      "/login",
      "/api/health",
      "/api/auth",
      "/api/dashboard",
      "/api/sustainability",
      "/api/coherence-chat",
      "/api/ratings/us.test",
      "/api/analyze/test.id/status",
      "/api/reference-data",
      "/api/uploads",
    ]) {
      expect(isGatedPath(p), p).toBe(false);
    }
  });
});

describe("proxy auth gate", () => {
  const orig = process.env.APP_ACCESS_TOKEN;
  beforeEach(() => {
    process.env.APP_ACCESS_TOKEN = TOKEN;
  });
  afterEach(() => {
    process.env.APP_ACCESS_TOKEN = orig;
  });

  it("returns 401 for an unauthenticated upload API call", async () => {
    expect((await proxy(req("/api/extract", { method: "POST" }))).status).toBe(401);
    expect((await proxy(req("/api/analyze", { method: "POST" }))).status).toBe(401);
  });

  it("redirects an unauthenticated upload page to /login with a return path", async () => {
    const res = await proxy(req("/es/panama/upload"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("from")).toBe("/es/panama/upload");
  });

  it("allows an authenticated upload API request through the gate", async () => {
    const res = await proxy(
      req("/api/extract", {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    );
    expect(res.status).not.toBe(401);
  });

  it("does not gate dashboards, analyses, chat, or status polling", async () => {
    // Dotted dynamic segments were once an auth-gate bypass (vuln-0001); they
    // are now legitimately open, but must still not be mistaken for static files.
    expect((await proxy(req("/en/analysis/test.id"))).status).toBe(200);
    expect((await proxy(req("/api/analyze/test.id/status"))).status).toBe(200);
    expect((await proxy(req("/api/sustainability"))).status).toBe(200);
    expect((await proxy(req("/api/coherence-chat", { method: "POST" }))).status).toBe(200);
    expect((await proxy(req("/mongolia"))).status).toBe(200);
  });

  it("passes static assets through without auth", async () => {
    expect((await proxy(req("/undp-logo.png"))).status).toBe(200);
  });

  it("leaves the public health + auth endpoints open", async () => {
    expect((await proxy(req("/api/health"))).status).toBe(200);
    expect((await proxy(req("/api/auth", { method: "POST" }))).status).toBe(200);
  });

  it("still blocks cross-site mutations on open API routes", async () => {
    const res = await proxy(
      req("/api/coherence-chat", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("fails closed for uploads in production when no token is set", async () => {
    delete process.env.APP_ACCESS_TOKEN;
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect((await proxy(req("/api/extract", { method: "POST" }))).status).toBe(401);
      expect((await proxy(req("/api/dashboard"))).status).toBe(200);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
