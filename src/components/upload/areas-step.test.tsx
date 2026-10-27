import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import type { OwnLensInput } from "@/lib/upload/own-areas";
import type { PublishedLens } from "@/lib/upload/published-areas";
import type { Draft } from "@/lib/upload/types";
import { AreasStep } from "./areas-step";

function draft(ownLens: OwnLensInput | null = null): Draft {
  return {
    id: "3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13",
    createdAt: "",
    updatedAt: "",
    country: "Tonga",
    locale: "en",
    documents: [],
    btr: null,
    ownLens,
    footprint: null,
    started: false,
    nextDoc: 1,
  };
}

const LENSES: PublishedLens[] = [
  { id: "globe", areas: ["Access and benefit sharing", "Restoration"] },
  { id: "ipcc", areas: ["Energy", "Transport"] },
  { id: "gga", areas: ["Water", "Health"] },
  { id: "hr", areas: ["Access to justice", "Gender equality"] },
];

function step(d: Draft) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <AreasStep draft={d} lenses={LENSES} onChange={onChange} onContinue={vi.fn()} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

afterEach(cleanup);

describe("AreasStep", () => {
  it("shows the four sets every analysis includes, each by its name in the brief, its areas folded away until asked for", () => {
    step(draft());
    expect(screen.getByRole("heading", { level: 3, name: "Included in every analysis" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual([
      "Biodiversity 2 areas",
      "Climate mitigation 2 areas",
      "Climate adaptation 2 areas",
      "Human rights 2 areas",
    ]);
    expect(screen.queryByRole("list", { name: "Climate mitigation" })).toBeNull();
    const toggle = screen.getByRole("button", { name: "Climate mitigation 2 areas" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const mitigation = screen.getByRole("list", { name: "Climate mitigation" });
    expect(within(mitigation).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Energy", "Transport"]);
    // The others stay folded.
    expect(screen.queryByRole("list", { name: "Biodiversity" })).toBeNull();
    fireEvent.click(toggle);
    expect(screen.queryByRole("list", { name: "Climate mitigation" })).toBeNull();
  });

  it("opens the own policy areas with visible fields, and says what they need only once something is typed", () => {
    const onChange = step(draft());
    fireEvent.click(screen.getByRole("button", { name: "Add own policy areas" }));
    expect(screen.getByRole("heading", { level: 3, name: "Own policy areas" })).toBeInTheDocument();
    expect(screen.getByLabelText("Area 1")).toHaveClass("up-box");
    expect(screen.getByLabelText("Description of area 1")).toHaveClass("up-box");
    // Left without a word in it, the set is none, and nothing is missing.
    fireEvent.blur(screen.getByLabelText("Name"));
    expect(onChange).toHaveBeenLastCalledWith({ op: "ownLens", value: null });
    expect(screen.queryByText("The policy areas need a name.")).toBeNull();
    fireEvent.change(screen.getByLabelText("Area 1"), { target: { value: "Water" } });
    fireEvent.blur(screen.getByLabelText("Area 1"));
    expect(screen.getByText("The policy areas need a name.")).toBeInTheDocument();
  });

  it("adds own policy areas with a name and areas", () => {
    const onChange = step(draft());
    fireEvent.click(screen.getByRole("button", { name: "Add own policy areas" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "National priorities" } });
    fireEvent.blur(screen.getByLabelText("Name"));
    expect(onChange).toHaveBeenLastCalledWith({
      op: "ownLens",
      value: { name: "National priorities", source: "", areas: [{ name: "", description: "" }] },
    });
  });

  it("takes two columns pasted from a spreadsheet as areas", () => {
    const onChange = step(draft({ name: "National priorities", areas: [{ name: "", description: "" }] }));
    fireEvent.click(screen.getByRole("button", { name: "Paste from a spreadsheet" }));
    fireEvent.change(screen.getByLabelText("Two columns: name and description"), {
      target: { value: "Water\tSafe water for all\nFood\tAccess to food" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add these areas" }));
    expect(onChange).toHaveBeenLastCalledWith({
      op: "ownLens",
      value: {
        name: "National priorities",
        source: "",
        areas: [
          { name: "Water", description: "Safe water for all" },
          { name: "Food", description: "Access to food" },
        ],
      },
    });
  });

  it("says what an area still needs", () => {
    step(draft({ name: "National priorities", areas: [{ name: "Water", description: "" }] }));
    expect(screen.getByText("Water needs a description.")).toBeInTheDocument();
  });

  it("removes the own policy areas", () => {
    const onChange = step(draft({ name: "National priorities", areas: [{ name: "Water", description: "Safe water" }] }));
    fireEvent.click(screen.getByRole("button", { name: "Remove own policy areas" }));
    expect(onChange).toHaveBeenLastCalledWith({ op: "ownLens", value: null });
  });
});
