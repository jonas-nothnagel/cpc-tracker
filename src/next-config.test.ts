import { describe, expect, it } from "vitest";
import config from "../next.config";

describe("next.config", () => {
  it("lets a 50 MB document through the proxy", () => {
    expect(config.experimental?.proxyClientMaxBodySize).toBe("55mb");
  });

  it("tells the pages whether this host can run uploads", () => {
    expect(config.env?.NEXT_PUBLIC_UPLOADS).toBe(process.env.VERCEL ? "0" : "1");
  });
});
