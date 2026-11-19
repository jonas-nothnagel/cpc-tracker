import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SectionHead } from "./section-head";

afterEach(cleanup);

describe("SectionHead", () => {
  it("names the section top left and states its insight top right", () => {
    const { container } = render(
      <SectionHead
        title="Reviewed biodiversity spending"
        titleId="brief-spending-title"
        source="Biodiversity Expenditure Review (BER), 2015–2024"
        controls={<button type="button">US$</button>}
        insight="US$1.2 of every US$100 of public spending was reviewed biodiversity spending."
      >
        <p>A chart</p>
      </SectionHead>,
    );
    const title = screen.getByRole("heading", { level: 2, name: "Reviewed biodiversity spending" });
    expect(title.id).toBe("brief-spending-title");
    expect(title.getAttribute("tabindex")).toBe("-1");
    expect(title.className).toBe("brief-sec-title");
    const [left, right] = [...container.querySelector(".brief-sec-head")!.children];
    expect(left.contains(title)).toBe(true);
    expect(left.textContent).toContain("Biodiversity Expenditure Review (BER), 2015–2024");
    expect(left.querySelector("button")?.textContent).toBe("US$");
    // The sentence is a finding beside the title, not a second heading.
    const insight = screen.getByText(/of every US\$100/);
    expect(insight.tagName).toBe("P");
    expect(insight.getAttribute("aria-live")).toBe("polite");
    expect(right.firstElementChild).toBe(insight);
    expect(right.textContent).toContain("A chart");
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("lets the title stand alone where there is nothing to state", () => {
    const { container } = render(<SectionHead title="Implementation" />);
    expect(container.querySelector(".brief-sec-head")!.children).toHaveLength(1);
    expect(container.querySelector(".brief-sec-source")).toBeNull();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });
});

const sheet = (...path: string[]) => readFileSync(join(process.cwd(), "src", "components", "brief", ...path), "utf8");
/** A rule's declarations, by its exact selector, outside any @media. */
const rule = (css: string, selector: string) =>
  [
    ...css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "")
      .matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ].find((m) => m[1].trim() === selector)?.[2] ?? null;

describe("the section head's styles", () => {
  const css = sheet("brief.css");

  it("opens on the overview's column split", () => {
    const hub = rule(css, "[data-brief] .brief-hub")!;
    const head = rule(css, "[data-brief] .brief-sec-head")!;
    const columns = (body: string) => body.match(/grid-template-columns:\s*([^;]+);/)?.[1];
    const gap = (body: string) => body.match(/(?:column-)?gap:\s*([^;]+);/)?.[1];
    expect(columns(head)).toBe(columns(hub));
    expect(gap(head)).toBe(gap(hub));
    // One column on a narrow screen, as the overview.
    expect(css).toMatch(/@media screen and \(max-width: 820px\) \{[^@]*\[data-brief\] \.brief-sec-head \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  });

  it("sets every section title in one step, defined once", () => {
    const title = rule(css, "[data-brief] .brief-sec-title")!;
    const family = (body: string) => body.match(/font-family:\s*([^;]+);/)?.[1];
    // The serif of the sentences beside it.
    expect(family(title)).toBe(family(rule(css, "[data-brief] .brief-hub-headline")!));
    expect(title).toMatch(/font-size: clamp\(1\.5rem, 2\.1vw, 1\.875rem\);/);
    expect(title).toMatch(/font-weight: 500;/);
    expect(title).toMatch(/line-height: 1\.2;/);
    for (const path of [
      ["spending", "spending.css"],
      ["nr7", "nr7.css"],
      ["contracts", "contracts.css"],
      ["explore", "explore.css"],
    ]) {
      expect(sheet(...path)).not.toMatch(/clamp\(1\.5rem, 2\.1vw, 1\.875rem\)/);
    }
  });
});
