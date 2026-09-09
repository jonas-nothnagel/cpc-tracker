import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

import { Nr7ReportsStrip } from "./reports-strip";
import { buildNr7Report } from "./nr7-self-report";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "./test-fixture";
import type { ImplementationCoverage } from "@/lib/implementation-coherence";

afterEach(cleanup);

const model = buildNr7Report(FIXTURE_NR7, FIXTURE_ALIGNMENT, FIXTURE_TARGETS)!;
const btr = { btrActions: 39, reached: 119, total: 178, targetsWithMisalignment: 8 } as ImplementationCoverage;

function renderStrip(props: Partial<Parameters<typeof Nr7ReportsStrip>[0]> = {}) {
  const onOpen = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Nr7ReportsStrip model={model} btrCoverage={btr} onOpenNr7Report={onOpen} {...props} />
    </NextIntlClientProvider>,
  );
  return { ...utils, onOpen };
}

describe("Nr7ReportsStrip", () => {
  it("renders nothing without an NR7 model", () => {
    const { container } = renderStrip({ model: null });
    expect(container.querySelector('[data-tour="coverage-reports"]')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows both cards with the headline numbers and up to three closer-look lines", () => {
    renderStrip();
    expect(screen.getByText("39 reported actions")).toBeInTheDocument();
    expect(screen.getByText("119 of 178 targets addressed")).toBeInTheDocument();
    expect(screen.getByText("8 targets to review")).toBeInTheDocument();
    expect(screen.getByText("5 questionnaire answers on 2 of 4 targets")).toBeInTheDocument();
    expect(screen.getByText("4 of 5 indicators with values")).toBeInTheDocument();
    const lines = screen.getByText("Worth a closer look").nextElementSibling!.querySelectorAll("li");
    expect(lines).toHaveLength(3);
    expect(lines[0].textContent).toContain("National target 1");
    expect(lines[0].textContent).toContain("2 of 3 questionnaire answers");
    expect(lines[1].textContent).toContain("progress rated unknown");
    expect(lines[2].textContent).toContain("unchanged at 20.77 %");
    expect(screen.getByText(/Computed, not AI-written/)).toBeInTheDocument();
  });

  it("drops the climate card when the country has no BTR", () => {
    renderStrip({ btrCoverage: null });
    expect(screen.queryByText("39 reported actions")).toBeNull();
    expect(screen.getByRole("button", { name: /Open the NR7 detail/ })).toBeInTheDocument();
  });

  it("opens the drawer from its one button", () => {
    const { onOpen } = renderStrip();
    fireEvent.click(screen.getByRole("button", { name: /Open the NR7 detail/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("never puts a suggestion on the card face", () => {
    const { container } = renderStrip();
    expect(container.textContent).not.toMatch(/\b(should|must|fail|ministry)\b/i);
  });
});
