import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { readdirSync } from "fs";
import { join, relative, sep } from "path";

// next-intl's ESM middleware build imports "next/server" in a way vitest can't
// resolve; the intl handler isn't exercised by these auth/static paths, so mock it.
vi.mock("next-intl/middleware", () => ({
  default: () => () => NextResponse.next(),
}));

const { default: proxy, isGatedPath, isPublicFile } = await import("./proxy");

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

  it("does not let a file extension on an API path skip the CSRF check", async () => {
    const res = await proxy(
      req("/api/ratings/mongolia.json", {
        method: "POST",
        headers: { origin: "https://evil.example", host: "app.example.org" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("leaves the public health + auth endpoints open", async () => {
    expect((await proxy(req("/api/health"))).status).toBe(200);
    expect((await proxy(req("/api/auth", { method: "POST" }))).status).toBe(200);
  });

  it("still blocks cross-site mutations on open API routes", async () => {
    const res = await proxy(
      req("/api/coherence-chat", {
        method: "POST",
        headers: { origin: "https://evil.example", host: "app.example.org" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("accepts a same-origin POST behind a reverse proxy (Host header, not listen address)", async () => {
    // In production the container listens on localhost:3000 while the public
    // hostname arrives in Host / X-Forwarded-Host. Origin must be compared to
    // those, or every browser POST is rejected as cross-site.
    const viaHost = await proxy(
      req("/api/auth", {
        method: "POST",
        headers: {
          origin: "https://cpc-tracker-c657.azurewebsites.net",
          host: "cpc-tracker-c657.azurewebsites.net",
        },
      }),
    );
    expect(viaHost.status).not.toBe(403);

    const viaForwarded = await proxy(
      req("/api/coherence-chat", {
        method: "POST",
        headers: {
          origin: "https://cpc-tracker-c657.azurewebsites.net",
          host: "localhost:3000",
          "x-forwarded-host": "cpc-tracker-c657.azurewebsites.net",
        },
      }),
    );
    expect(viaForwarded.status).not.toBe(403);
  });

  it("treats a malformed Origin on a mutation as cross-site", async () => {
    const res = await proxy(
      req("/api/coherence-chat", { method: "POST", headers: { origin: "not a url" } }),
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

describe("isPublicFile", () => {
  it("covers every file under public/, so none falls through to locale routing", () => {
    // A public file whose extension is not on the list is rewritten to
    // /en/<file> by next-intl and 404s (the methodology walkthrough, 2026-09-15
    // to 2026-09-17). Adding a file type to public/ must extend PUBLIC_FILE_RE.
    const root = join(process.cwd(), "public");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.push("/" + relative(root, full).split(sep).join("/"));
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(0);
    const uncovered = files.filter((f) => !isPublicFile(f));
    expect(uncovered, "public files the proxy would swallow").toEqual([]);
  });

  it("names the walkthrough and brief in every locale, and common document types", () => {
    for (const f of [
      "/methodology-experience.html",
      "/methodology-experience.es.html",
      "/methodology-brief.mn.html",
      "/guide.pdf",
      "/data/export.csv",
      "/notes.md",
    ]) {
      expect(isPublicFile(f), f).toBe(true);
    }
  });

  it("is not consulted for pages or API routes with dotted segments", () => {
    expect(isPublicFile("/en/analysis/test.id")).toBe(false);
    expect(isPublicFile("/api/analyze/test.id/status")).toBe(false);
    expect(isPublicFile("/mongolia")).toBe(false);
  });
});
