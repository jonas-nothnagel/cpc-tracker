import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "components", "brief", "brief.css"), "utf8");
/** Every rule's selector with its declarations, in file order. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));

describe("the policy-area names' motion", () => {
  it("glides a name to its row only while the dots move, so nothing slides when the page opens", () => {
    const moving = rules.filter((r) => /\.brief-av-row/.test(r.selector) && /transition:\s*transform/.test(r.body));
    expect(moving.length).toBeGreaterThan(0);
    expect(moving.every((r) => r.selector.includes(".brief-av-field[data-moving]"))).toBe(true);
  });
});
