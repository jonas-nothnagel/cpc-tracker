import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";
import { buildNr7Report } from "./index";
import { Nr7TargetDetail } from "./target-detail";
import { FIXTURE_ALIGNMENT, FIXTURE_NR7, FIXTURE_TARGETS } from "./test-fixture";

afterEach(cleanup);

const model = buildNr7Report(FIXTURE_NR7, FIXTURE_ALIGNMENT, FIXTURE_TARGETS)!;
const indicatorsById = new Map(model.indicators.map((i) => [i.id, i]));
const rowOf = (id: string) => model.targets.find((r) => r.targetId === id)!;

describe("Nr7TargetDetail", () => {
  it("renders the report's entry: narrative, questionnaire, the target's indicators and a shared-indicator chip that hands off", () => {
    const onFocusIndicator = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Nr7TargetDetail row={rowOf("NT01")} indicatorsById={indicatorsById} onFocusIndicator={onFocusIndicator} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Progress summary (verbatim)")).toBeInTheDocument();
    expect(screen.getByText(/Mainstreaming has advanced through the planning law/)).toBeInTheDocument();
    expect(screen.getByText("Questionnaire")).toBeInTheDocument();
    expect(screen.getByText("Indicators reported under this target")).toBeInTheDocument();
    const shared = rowOf("NT01").sharedIndicatorIds;
    expect(shared.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: indicatorsById.get(shared[0])!.code ?? shared[0] }));
    expect(onFocusIndicator).toHaveBeenCalledWith(shared[0]);
    // No links unless the caller passes them.
    expect(screen.queryByRole("button", { name: /Open NBSAP target/ })).toBeNull();
  });

  it("renders the links onward only when given", () => {
    const onOpenNbsap = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Nr7TargetDetail row={rowOf("NT01")} indicatorsById={indicatorsById} onFocusIndicator={vi.fn()} links={{ onOpenNbsap }} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open NBSAP target 1 ›" }));
    expect(onOpenNbsap).toHaveBeenCalled();
  });
});
