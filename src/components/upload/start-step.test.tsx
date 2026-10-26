import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import type { Draft, DraftDocument } from "@/lib/upload/types";
import { StartStep } from "./start-step";

const doc = (id: string, n: number): DraftDocument => ({
  id,
  source: "read",
  fileName: `${id}.pdf`,
  name: id,
  code: id.toUpperCase(),
  state: "read",
  targets: Array.from({ length: n }, (_, i) => ({ key: `${id}-${i}`, label: "", text: "t" })),
});

const draft = (documents: DraftDocument[], country = "Sri Lanka"): Draft => ({
  id: "3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13",
  createdAt: "",
  updatedAt: "",
  country,
  locale: "en",
  documents,
  btr: null,
  ownLens: null,
  footprint: null,
  started: false,
  nextDoc: documents.length + 1,
});

const SPEED = { pairsPerMinute: 450, gramsPerCall: 0.083 };

function step(d: Draft, ahead = 0, onStart = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <StartStep draft={d} ahead={ahead} speed={SPEED} onStart={onStart} />
    </NextIntlClientProvider>,
  );
  return onStart;
}

afterEach(cleanup);

describe("StartStep", () => {
  it("states the analysis's scale, its time and footprint", () => {
    step(draft([doc("a", 56), doc("b", 11), doc("c", 22)]));
    expect(screen.getByText("3 policy documents.")).toBeInTheDocument();
    expect(screen.getByText("89 targets.")).toBeInTheDocument();
    expect(screen.getByText("2,090 target pairs to compare.")).toBeInTheDocument();
    expect(screen.getByText(/About 5 minutes and 0.2 kg/)).toBeInTheDocument();
    expect(screen.getByTitle("carbon dioxide equivalent")).toHaveTextContent("CO2e");
  });

  it("says how many analyses are ahead in line", () => {
    step(draft([doc("a", 5), doc("b", 5)]), 1);
    expect(screen.getByText("1 analysis is ahead in line.")).toBeInTheDocument();
  });

  it("starts the analysis", () => {
    const onStart = step(draft([doc("a", 5), doc("b", 5)]));
    fireEvent.click(screen.getByRole("button", { name: "Start the analysis" }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("names what stands in the way, and does not start", () => {
    step(draft([doc("a", 5)], ""));
    expect(screen.getByText("A country name is needed.")).toBeInTheDocument();
    expect(screen.getByText("Targets from at least 2 documents are needed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start the analysis" })).toBeDisabled();
  });

  it("does not start while a document is not read yet", () => {
    step(draft([doc("a", 5), doc("b", 5), { ...doc("c", 0), state: "added" }]));
    expect(screen.getByText("Some documents are not read yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start the analysis" })).toBeDisabled();
  });
});
