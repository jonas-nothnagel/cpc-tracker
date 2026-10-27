import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { applyChanges } from "@/lib/upload/changes";
import type { DraftChange } from "@/lib/upload/types";
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
  it("lists every document's targets under its name, the wording as written", () => {
    step(draft([water, energy]));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "National Water Resource Policy",
      "Energy Policy",
    ]);
    const list = screen.getByRole("list", { name: "National Water Resource Policy" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("1.1")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Energy Policy" })).getByText("Reach 70% renewable electricity")).toBeInTheDocument();
    expect(screen.getByText("2 targets")).toBeInTheDocument();
    // Nothing reads as a form until a wording is edited.
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("removes a target and offers it back", () => {
    const onChange = step(draft([water]));
    fireEvent.click(within(screen.getByText("Restore degraded watersheds").closest("li")!).getByRole("button", { name: "Remove" }));
    expect(onChange).toHaveBeenCalledWith({ op: "target", docId: "d1", key: "d1-2", removed: true });
  });

  it("offers a removed target back", () => {
    const removed = doc("d1", "National Water Resource Policy", [target("d1-1", "1.1", "Protect wetlands", { removed: true })]);
    const onChange = step(draft([removed]));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(onChange).toHaveBeenCalledWith({ op: "target", docId: "d1", key: "d1-1", removed: false });
  });

  it("edits a wording in place on request, and sends it once the field is left, not on every key", () => {
    const onChange = step(draft([water]));
    const row = screen.getByText("Protect wetlands of national importance").closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Edit" }));
    const text = within(row).getByRole("textbox", { name: "Target 1.1" });
    expect(text).toHaveValue("Protect wetlands of national importance");
    expect(text).toHaveFocus();
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

  it("removes a target in one click right after its wording was edited", () => {
    const seen: DraftChange[] = [];
    function Page() {
      const [d, setD] = useState(draft([water]));
      return (
        <TargetsStep
          draft={d}
          colors={["#4f46e5"]}
          over={0}
          onChange={(c) => {
            seen.push(c);
            setD((prev) => {
              const next = structuredClone(prev);
              applyChanges(next, [c]);
              return next;
            });
          }}
          onContinue={vi.fn()}
        />
      );
    }
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <Page />
      </NextIntlClientProvider>,
    );
    const row = screen.getByText("Protect wetlands of national importance").closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Edit" }));
    const text = within(row).getByRole("textbox");
    const remove = within(row).getByRole("button", { name: "Remove" });
    fireEvent.change(text, { target: { value: "Protect every wetland" } });
    fireEvent.blur(text);
    fireEvent.click(remove);
    expect(seen.map((c) => c.op === "target" && (c.text ?? (c.removed ? "removed" : "")))).toEqual(["Protect every wetland", "removed"]);
  });
});
