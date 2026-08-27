import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  cookieValue,
  gateBypassed,
  hasValidAuth,
  verifyToken,
} from "./token";

const TOKEN = "s3cret-admin-token";

/** Minimal NextRequest stand-in — hasValidAuth only reads headers + cookies. */
function fakeReq(opts: { authorization?: string; cookie?: string }): NextRequest {
  const headers = new Headers();
  if (opts.authorization) headers.set("authorization", opts.authorization);
  return {
    headers,
    cookies: {
      get: (name: string) =>
        name === AUTH_COOKIE && opts.cookie !== undefined
          ? { name, value: opts.cookie }
          : undefined,
    },
  } as unknown as NextRequest;
}

describe("auth token", () => {
  const original = process.env.APP_ACCESS_TOKEN;
  beforeEach(() => {
    process.env.APP_ACCESS_TOKEN = TOKEN;
  });
  afterEach(() => {
    process.env.APP_ACCESS_TOKEN = original;
  });

  it("verifies the correct token and rejects others", async () => {
    expect(await verifyToken(TOKEN)).toBe(true);
    expect(await verifyToken("wrong")).toBe(false);
    expect(await verifyToken("")).toBe(false);
  });

  it("accepts a valid Bearer header", async () => {
    expect(await hasValidAuth(fakeReq({ authorization: `Bearer ${TOKEN}` }))).toBe(true);
    expect(await hasValidAuth(fakeReq({ authorization: "Bearer nope" }))).toBe(false);
  });

  it("accepts a valid session cookie (digest of the token)", async () => {
    const good = (await cookieValue())!;
    expect(await hasValidAuth(fakeReq({ cookie: good }))).toBe(true);
    expect(await hasValidAuth(fakeReq({ cookie: "deadbeef" }))).toBe(false);
  });

  it("rejects requests with no credentials", async () => {
    expect(await hasValidAuth(fakeReq({}))).toBe(false);
  });

  it("is not bypassed when a token is configured", () => {
    expect(gateBypassed()).toBe(false);
  });

  it("fails closed when unset (verify/hasValidAuth return false)", async () => {
    delete process.env.APP_ACCESS_TOKEN;
    expect(await verifyToken("anything")).toBe(false);
    expect(await hasValidAuth(fakeReq({ authorization: "Bearer anything" }))).toBe(false);
    // ...but the gate is bypassed in non-production so local dev stays open.
    expect(gateBypassed()).toBe(true);
  });
});
