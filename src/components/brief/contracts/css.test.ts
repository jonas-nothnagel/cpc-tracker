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

  it("keeps the focus line opaque, so nothing reads through it while the page scrolls", () => {
    const rule = css.match(/\.ct-focusbar \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/background: (#fff|#ffffff|var\(--brief-paper\));/);
  });

  it("lets no hidden name catch the pointer while the squares move", () => {
    expect(css).toMatch(/\.ct-labels\[data-moving\] \.ct-label-button \{[^}]*pointer-events: none;/);
  });
});
