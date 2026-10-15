import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "brief.css"), "utf8");

/** The narrow-screen block that places the brief's top bar, with its width. */
function topBarBlock(): { width: number; body: string } | undefined {
  for (const m of css.matchAll(/@media screen and \(max-width: (\d+)px\) \{([\s\S]*?)\n\}/g)) {
    if (m[2].includes(".brief-hero-top")) return { width: Number(m[1]), body: m[2] };
  }
  return undefined;
}

describe("the brief's hero styles", () => {
  it("lets the top bar join the flow on narrow screens, so its extra rows push the brief down instead of covering it", () => {
    // Laid over the hero, the bar leaves room for one row only (the content's
    // 4rem top padding). With the languages, a translation note and the
    // previous dashboard it wraps to two or three rows below about 680px.
    const block = topBarBlock();
    expect(block).toBeDefined();
    expect(block!.width).toBeGreaterThanOrEqual(680);
    expect(block!.body).toMatch(/\.brief-hero:has\(> \.brief-hero-top\) \{[^}]*flex-direction: column;/);
    expect(block!.body).toMatch(/\.brief-hero-top \{[^}]*position: relative;/);
  });

  it("leaves the landing's hero alone: only a hero with a top bar changes", () => {
    const block = topBarBlock();
    expect(block).toBeDefined();
    expect(block!.body).not.toMatch(/\[data-brief\] \.brief-hero \{/);
    expect(block!.body).not.toMatch(/\[data-brief\] \.brief-hero-content \{/);
  });
});
