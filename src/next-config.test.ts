import { existsSync } from "fs";
import { describe, expect, it, vi } from "vitest";
import config, { VERCEL_LEAVES_OUT } from "../next.config";

describe("next.config", () => {
  it("lets a 50 MB document through the proxy", () => {
    expect(config.experimental?.proxyClientMaxBodySize).toBe("55mb");
  });

  it("tells the pages whether this host can run uploads", () => {
    expect(config.env?.NEXT_PUBLIC_UPLOADS).toBe(process.env.VERCEL ? "0" : "1");
  });

  it("leaves the comparison's other runs out of Vercel's bundle only, and only folders that exist", async () => {
    vi.resetModules();
    vi.stubEnv("VERCEL", "1");
    const onVercel = (await import("../next.config")).default;
    expect(onVercel.outputFileTracingExcludes).toEqual({ "*": VERCEL_LEAVES_OUT });
    vi.unstubAllEnvs();
    vi.stubEnv("VERCEL", "");
    vi.resetModules();
    const elsewhere = (await import("../next.config")).default;
    expect(elsewhere.outputFileTracingExcludes).toEqual({});
    vi.unstubAllEnvs();
    // A renamed run would silently stay in the bundle: each pattern names a
    // folder that is there.
    for (const pattern of VERCEL_LEAVES_OUT) expect(existsSync(pattern.replace("/**", ""))).toBe(true);
  });
});
