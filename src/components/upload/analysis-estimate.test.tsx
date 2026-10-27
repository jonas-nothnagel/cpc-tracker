import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { AnalysisEstimate } from "./analysis-estimate";

function estimate(opts: { docTypes: number; countryMissing?: boolean; onRun?: () => void }) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <AnalysisEstimate
        targetCount={12}
        activeNbsCount={0}
        activeSectorsCount={7}
        estimate={{ totalCalls: 100, estCost: 0.02, estPairs: 36, docTypes: opts.docTypes }}
        hasBtrData={false}
        submitting={false}
        countryMissing={opts.countryMissing ?? false}
        onRunAnalysis={opts.onRun ?? (() => {})}
      />
    </NextIntlClientProvider>,
  );
}

const runButton = () => screen.getByRole("button", { name: en.upload.estimate.runAnalysis });

afterEach(cleanup);

describe("AnalysisEstimate", () => {
  it("does not start a run with targets from one document", () => {
    estimate({ docTypes: 1 });
    expect(runButton()).toBeDisabled();
  });

  it("does not start a run without a country name, and says why", () => {
    estimate({ docTypes: 2, countryMissing: true });
    expect(runButton()).toBeDisabled();
    expect(screen.getByText(en.upload.estimate.needCountry)).toBeInTheDocument();
  });

  it("starts a run once the country is named and two documents are in", () => {
    const onRun = vi.fn();
    estimate({ docTypes: 2, onRun });
    fireEvent.click(runButton());
    expect(onRun).toHaveBeenCalledTimes(1);
  });
});
