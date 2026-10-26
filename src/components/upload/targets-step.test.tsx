import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import type { Draft, DraftDocument, DraftTarget } from "@/lib/upload/types";
import { TargetsStep } from "./targets-step";

const target = (key: string, label: string, text: string, more: Partial<DraftTarget> = {}): DraftTarget => ({
  key,
  label,
  text,
  ...more,
});

function doc(id: string, name: string, targets: DraftTarget[]): DraftDocument {
  return { id, source: "read", fileName: `${id}.pdf`, name, code: id.toUpperCase(), state: "read", targets };
}

function draft(documents: DraftDocument[]): Draft {
  return {
    id: "3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13",
    createdAt: "",
    updatedAt: "",
    country: "Panama",
    locale: "en",
    documents,
    btr: null,
    ownLens: null,
    footprint: null,
    started: false,
    nextDoc: documents.length + 1,
  };
}

const water = doc("d1", "National Water Resource Policy", [
  target("d1-1", "1.1", "Protect wetlands of national importance", {
    pageNumbers: [12],
    sources: [{ sourceText: "1.1 Wetlands of national importance shall be protected.", pages: [12] }],
  }),
  target("d1-2", "1.2", "Restore degraded watersheds", {
    language: "es",
    textOriginal: "Restaurar las cuencas degradadas",
  }),
]);
const energy = doc("d2", "Energy Policy", [target("d2-1", "", "Reach 70% renewable electricity")]);

function step(d: Draft, onChange = vi.fn(), colors = ["#4f46e5", "#9d174d"]) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <TargetsStep draft={d} colors={colors} over={0} onChange={onChange} onContinue={vi.fn()} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

afterEach(cleanup);

describe("TargetsStep", () => {
  it("lists the chosen document's targets and switches to another document", () => {
    step(draft([water, energy]));
    const list = screen.getByRole("list", { name: "National Water Resource Policy" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("1.1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Energy Policy/ }));
    expect(screen.getByRole("list", { name: "Energy Policy" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Reach 70% renewable electricity")).toBeInTheDocument();
  });

  it("removes a target and offers it back", () => {
    const onChange = step(draft([water]));
    fireEvent.click(within(screen.getByDisplayValue("Restore degraded watersheds").closest("li")!).getByRole("button", { name: "Remove" }));
    expect(onChange).toHaveBeenCalledWith({ op: "target", docId: "d1", key: "d1-2", removed: true });
  });

  it("offers a removed target back", () => {
    const removed = doc("d1", "National Water Resource Policy", [target("d1-1", "1.1", "Protect wetlands", { removed: true })]);
    const onChange = step(draft([removed]));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(onChange).toHaveBeenCalledWith({ op: "target", docId: "d1", key: "d1-1", removed: false });
  });

  it("sends an edited wording once the field is left, not on every key", () => {
    const onChange = step(draft([water]));
    const text = screen.getByDisplayValue("Protect wetlands of national importance");
    fireEvent.change(text, { target: { value: "Protect all wetlands of national importance" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(text);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      op: "target",
      docId: "d1",
      key: "d1-1",
      text: "Protect all wetlands of national importance",
    });
  });

  it("shows the passage the target was read from", () => {
    step(draft([water]));
    expect(screen.queryByText("1.1 Wetlands of national importance shall be protected.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "page 12" }));
    expect(screen.getByText("As written in National Water Resource Policy")).toBeInTheDocument();
    expect(screen.getByText("1.1 Wetlands of national importance shall be protected.")).toBeInTheDocument();
  });

  it("keeps the original wording beside the English, in its language", () => {
    step(draft([water]));
    expect(screen.getByText("Restaurar las cuencas degradadas")).toHaveAttribute("lang", "es");
  });

  it("adds a target the reviewer types in", () => {
    const onChange = step(draft([water]));
    fireEvent.click(screen.getByRole("button", { name: "Add a target" }));
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "1.3" } });
    fireEvent.change(screen.getByLabelText("Target"), { target: { value: "Map all aquifers" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onChange).toHaveBeenCalledWith({ op: "addTarget", docId: "d1", label: "1.3", text: "Map all aquifers" });
  });

  it("says how many targets stand between the draft and the start", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <TargetsStep draft={draft([water])} colors={["#4f46e5"]} over={1} onChange={vi.fn()} onContinue={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Remove 1 target to start.")).toBeInTheDocument();
  });
});
