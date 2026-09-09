import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

import { Nr7ReportLine } from "./nr7-report-line";
import { buildNr7Report } from "./nr7-self-report";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "./test-fixture";

afterEach(cleanup);

const model = buildNr7Report(FIXTURE_NR7, FIXTURE_ALIGNMENT, FIXTURE_TARGETS)!;

function renderLine(m = model) {
  const onOpen = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Nr7ReportLine model={m} onOpenNr7Report={onOpen} />
    </NextIntlClientProvider>,
  );
  return { ...utils, onOpen };
}

describe("Nr7ReportLine", () => {
  it("renders nothing without an NR7 model", () => {
    const { container } = renderLine(null as unknown as typeof model);
    expect(container).toBeEmptyDOMElement();
  });

  it("is one caption line: the self-rating counts, the cross-check count and the detail link", () => {
    const { container } = renderLine();
    const line = container.querySelector('[data-tour="nr7-line"]')!;
    expect(line.tagName).toBe("P");
    expect(line.textContent).toContain("NR7 self-rating:");
    expect(line.textContent).toContain("2 on track");
    expect(line.textContent).toContain("1 no progress");
    expect(line.textContent).toContain("1 unknown");
    expect(line.textContent).not.toContain("limited"); // zero counts are not listed
    expect(screen.getByRole("button", { name: /5 cross-checks worth a closer look/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /NR7 detail/ })).toBeInTheDocument();
    expect(container.querySelector("article")).toBeNull(); // no cards
  });

  it("both links open the drawer", () => {
    const { onOpen } = renderLine();
    fireEvent.click(screen.getByRole("button", { name: /worth a closer look/ }));
    fireEvent.click(screen.getByRole("button", { name: /NR7 detail/ }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("keeps suggestions off the slide face", () => {
    const { container } = renderLine();
    expect(container.textContent).not.toMatch(/\b(should|must|fail|ministry)\b/i);
  });
});
