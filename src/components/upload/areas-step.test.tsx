import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import type { OwnLensInput } from "@/lib/upload/own-areas";
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

function step(d: Draft) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <AreasStep draft={d} onChange={onChange} onContinue={vi.fn()} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

afterEach(cleanup);

describe("AreasStep", () => {
  it("lists the four published policy areas by their names in the brief", () => {
    step(draft());
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Biodiversity",
      "Climate mitigation",
      "Climate adaptation",
      "Human rights",
    ]);
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
