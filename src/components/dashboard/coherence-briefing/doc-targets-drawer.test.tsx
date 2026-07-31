import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { DrawerShell } from "@/components/ui/drawer-shell";
import {
  DEFAULT_DOC_TARGETS_VIEW,
  DocTargetsDrawer,
  type DocTargetsView,
} from "./doc-targets-drawer";
import type { Target } from "@/types";

beforeAll(() => {
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame;
});

afterEach(cleanup);

function makeTarget(n: number, overrides: Partial<Target> = {}): Target {
  return {
    id: `NAP_${n}`,
    text: `Strengthen resilience measure number ${n}`,
    sourceDocument: "NAP",
    sourceLabel: `${n}.0`,
    country: "Sri Lanka",
    isQuantitative: false,
    isTimeBound: false,
    ...overrides,
  };
}

/** 40 targets, enough that the first batch of 30 leaves a remainder. */
const MANY = Array.from({ length: 40 }, (_, i) => makeTarget(i + 1));

function Host({
  targets = MANY,
  flagged = new Map<string, number>(),
  isDocExcluded = false,
  onOpenTargetProfile = vi.fn(),
}: {
  targets?: Target[];
  flagged?: Map<string, number>;
  isDocExcluded?: boolean;
  onOpenTargetProfile?: (id: string) => void;
}) {
  const [view, setView] = useState<DocTargetsView>(DEFAULT_DOC_TARGETS_VIEW);
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <DrawerShell open onClose={vi.fn()} dialogLabel="Targets">
        <DocTargetsDrawer
          doc="NAP"
          targets={targets}
          flaggedCountByTargetId={flagged}
          isDocExcluded={isDocExcluded}
          countryConfig={null}
          view={view}
          onViewChange={setView}
          onOpenTargetProfile={onOpenTargetProfile}
        />
      </DrawerShell>
    </NextIntlClientProvider>
  );
}

const rows = () => screen.queryAllByText(/^\d+\.0$/);
const search = () => screen.getByLabelText("Search these targets");
const showMore = () => screen.getByRole("button", { name: /Show \d+ more/ });

describe("DocTargetsDrawer listing", () => {
  it("reveals the first batch and reports the total", () => {
    render(<Host />);
    expect(rows()).toHaveLength(30);
    expect(screen.getByText("Showing 30 of 40 targets")).toBeInTheDocument();
    expect(showMore()).toHaveTextContent("Show 10 more");
  });

  it("keeps the document's own order", () => {
    render(<Host />);
    expect(rows().slice(0, 3).map((n) => n.textContent)).toEqual([
      "1.0",
      "2.0",
      "3.0",
    ]);
  });

  it("reveals the rest and drops the control once nothing is left", () => {
    render(<Host />);
    fireEvent.click(showMore());
    expect(rows()).toHaveLength(40);
    expect(screen.getByText("Showing 40 of 40 targets")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show \d+ more/ })).toBeNull();
  });

  it("puts focus on the first newly revealed row, not back at the top", () => {
    // Guards the race with the focus trap's observer: when the last batch is
    // revealed the button unmounts, and without this the reader is thrown to
    // the top of a 40-row list.
    render(<Host />);
    fireEvent.click(showMore());
    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      "Show full target 31.0",
    );
  });
});

describe("DocTargetsDrawer search", () => {
  it("narrows as the reader types", () => {
    render(<Host />);
    fireEvent.change(search(), { target: { value: "number 37" } });
    expect(rows().map((n) => n.textContent)).toEqual(["37.0"]);
    expect(screen.getByText("Showing 1 of 1 targets")).toBeInTheDocument();
  });

  it("matches on the reference label as well as the wording", () => {
    render(<Host />);
    fireEvent.change(search(), { target: { value: "12.0" } });
    expect(rows().map((n) => n.textContent)).toEqual(["12.0"]);
  });

  it("goes back to the first batch when the query changes", () => {
    render(<Host />);
    fireEvent.click(showMore());
    expect(rows()).toHaveLength(40);
    // Still matches every target, so only the reveal count can explain 30.
    fireEvent.change(search(), { target: { value: "resilience" } });
    expect(rows()).toHaveLength(30);
    expect(showMore()).toHaveTextContent("Show 10 more");
  });

  it("explains an empty result and offers a way out", () => {
    render(<Host />);
    fireEvent.change(search(), { target: { value: "permafrost" } });
    expect(
      screen.getByText("No targets in this document match that search."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(rows()).toHaveLength(30);
  });

  it("clears the field on Escape before the panel would close", () => {
    render(<Host />);
    fireEvent.change(search(), { target: { value: "number 7" } });
    fireEvent.keyDown(search(), { key: "Escape" });
    expect(search()).toHaveValue("");
    expect(rows()).toHaveLength(30);
  });
});

describe("DocTargetsDrawer filters", () => {
  const mixed = [
    makeTarget(1, { isQuantitative: true }),
    makeTarget(2, { isTimeBound: true }),
    makeTarget(3, { isQuantitative: true, isTimeBound: true }),
    makeTarget(4),
  ];

  it("offers only the dimensions the document actually uses", () => {
    render(<Host targets={mixed} />);
    expect(
      screen.getByRole("button", { name: "Quantitative (2)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Time-bound (2)" }),
    ).toBeInTheDocument();
    // No target sits in a potentially misaligned pair, so no dead control.
    expect(
      screen.queryByRole("button", { name: /In potential misalignments/ }),
    ).toBeNull();
  });

  it("narrows on click and combines with AND", () => {
    render(<Host targets={mixed} />);
    fireEvent.click(screen.getByRole("button", { name: "Quantitative (2)" }));
    expect(rows().map((n) => n.textContent)).toEqual(["1.0", "3.0"]);
    fireEvent.click(screen.getByRole("button", { name: "Time-bound (2)" }));
    expect(rows().map((n) => n.textContent)).toEqual(["3.0"]);
  });

  it("explains an empty filter result separately from an empty search", () => {
    render(
      <Host targets={[makeTarget(1, { isQuantitative: true }), makeTarget(2)]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Quantitative (1)" }));
    fireEvent.change(search(), { target: { value: "number 2" } });
    expect(
      screen.getByText("No targets in this document match that search."),
    ).toBeInTheDocument();
  });

  it("shows no filter row at all when the document uses none of them", () => {
    render(<Host targets={[makeTarget(1), makeTarget(2)]} />);
    expect(screen.queryByRole("group", { name: "Filter these targets" })).toBeNull();
  });
});

describe("DocTargetsDrawer rows", () => {
  const flagged = new Map([["NAP_1", 3]]);

  it("reports how many potentially misaligned pairs a target sits in", () => {
    render(<Host targets={[makeTarget(1), makeTarget(2)]} flagged={flagged} />);
    expect(screen.getByText("3 potential misalignments")).toBeInTheDocument();
  });

  it("expands in place to the full text", () => {
    render(<Host targets={[makeTarget(1)]} />);
    const toggle = screen.getByRole("button", { name: "Show full target 1.0" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "Hide full target 1.0" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("offers the drill into a target's pairs only when it has some", () => {
    const onOpenTargetProfile = vi.fn();
    render(
      <Host
        targets={[makeTarget(1), makeTarget(2)]}
        flagged={flagged}
        onOpenTargetProfile={onOpenTargetProfile}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show full target 2.0" }));
    expect(
      screen.queryByRole("button", {
        name: /View this target's potential misalignments/,
      }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show full target 1.0" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: /View this target's potential misalignments/,
      }),
    );
    expect(onOpenTargetProfile).toHaveBeenCalledWith("NAP_1");
  });
});

describe("DocTargetsDrawer edge cases", () => {
  it("says so plainly when a document yielded no targets, and hides the controls", () => {
    render(<Host targets={[]} />);
    expect(
      screen.getByText("No targets were extracted from this document."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Search these targets")).toBeNull();
  });

  it("takes only the targets belonging to this document", () => {
    render(
      <Host
        targets={[makeTarget(1), makeTarget(2, { sourceDocument: "NDC" })]}
      />,
    );
    expect(rows().map((n) => n.textContent)).toEqual(["1.0"]);
  });

  it("explains why an excluded document shows no misalignment counts", () => {
    render(<Host targets={[makeTarget(1)]} isDocExcluded />);
    expect(
      screen.getByText(/currently excluded from the analysis/),
    ).toBeInTheDocument();
  });
});
