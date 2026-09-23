import { describe, expect, it } from "vitest";

// next.config.ts is plain TypeScript; the next-intl plugin wrapper keeps
// `headers()` intact, so the rules can be read back and checked here.
const { default: config } = await import("../../next.config");

type Rule = { source: string; headers: { key: string; value: string }[] };

function header(rule: Rule, key: string): string | undefined {
  return rule.headers.find((h) => h.key === key)?.value;
}

describe("security headers", () => {
  it("forbid framing everywhere, and allow same-origin framing only for the methodology walkthrough files", async () => {
    const rules = (await config.headers!()) as Rule[];
    const [everything, framed] = rules;
    expect(everything.source).toBe("/:path*");
    expect(header(everything, "Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(header(everything, "X-Frame-Options")).toBe("DENY");
    // The exception comes after the default so it wins for the same key.
    expect(rules.indexOf(framed)).toBeGreaterThan(rules.indexOf(everything));
    expect(header(framed, "Content-Security-Policy")).toContain("frame-ancestors 'self'");
    expect(header(framed, "Content-Security-Policy")).not.toContain("frame-ancestors 'none'");
    expect(header(framed, "X-Frame-Options")).toBe("SAMEORIGIN");
    // The source names the framed files (every locale) and nothing else.
    const re = new RegExp("^" + framed.source.replace(/^\/:file\((.*)\)$/, "/$1") + "$");
    for (const f of ["/methodology-experience.html", "/methodology-experience.es.html", "/methodology-experience.mn.html"]) {
      expect(re.test(f), f).toBe(true);
    }
    for (const f of ["/methodology-brief.html", "/mongolia", "/methodology-experience.html/x"]) {
      expect(re.test(f), f).toBe(false);
    }
  });
});
