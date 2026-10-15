import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "contracts.css"), "utf8");

/** The rule blocks at the top level of the sheet, outside any @media. */
function topLevel(sheet: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let inMedia = false;
  for (let i = 0; i < sheet.length; i++) {
    const ch = sheet[i];
    if (ch === "{") {
      if (depth === 0) {
        const head = sheet.slice(start, i);
        inMedia = head.trim().startsWith("@media") || /\n@media/.test(head);
        if (!inMedia) out.push(head.trim());
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) start = i + 1;
    }
  }
  return out;
}

describe("the contracts page's styles", () => {
  it("leaves the phone's field to the brief: the sticky field's desktop size sits inside a desktop query", () => {
    const heads = topLevel(css);
    expect(heads.some((h) => h.includes(".ct-overview .brief-hub-stage"))).toBe(false);
    expect(css).toMatch(/@media \(min-width: 821px\) \{[^@]*\.ct-overview \.brief-hub-stage \{[^}]*height:/);
  });

  it("keeps the field whole until the last step has been read: the steps run on below its table", () => {
    // The field sticks only while the steps continue below it; the last step's
    // table ended with the section, so the field left while the table was read.
    const desktop = css.match(/@media \(min-width: 821px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(desktop).toMatch(/\.ct-overview \.brief-hub-stage \{[^}]*top: var\(--ct-stage-top\);[^}]*height: var\(--ct-stage-height\);/);
    expect(desktop).toMatch(
      /\.ct-overview \.brief-hub-step:last-child \{[^}]*padding-bottom: max\(0px, calc\(var\(--ct-stage-top\) \+ var\(--ct-stage-height\) - 50vh\)\);/,
    );
  });

  it("keeps the focus line opaque, so nothing reads through it while the page scrolls", () => {
    const rule = css.match(/\.ct-focusbar \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/background: (#fff|#ffffff|var\(--brief-paper\));/);
  });

  it("lets no hidden name catch the pointer while the squares move", () => {
    expect(css).toMatch(/\.ct-labels\[data-moving\] \.ct-label-button \{[^}]*pointer-events: none;/);
  });
});
