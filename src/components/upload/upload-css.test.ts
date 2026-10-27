import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "upload.css"), "utf8");

describe("the upload page's styles", () => {
  it("puts no pattern or gradient behind the drop field or anything else, so the only dots on the page are data", () => {
    expect(css).not.toMatch(/gradient\(/);
    expect(css).not.toMatch(/background-image/);
  });

  it("still shows a file dragged over the drop field with a solid ink border", () => {
    expect(css).toMatch(/\.up-drop\[data-active\] \{[^}]*border-style: solid;[^}]*border-color: var\(--brief-ink\);/);
  });
});
