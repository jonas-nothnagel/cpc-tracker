import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import type { ExploreItem } from "@/lib/brief/explore/model";
import { PairView } from "./pair-view";

const saved = { fetch: globalThis.fetch };

const item = (id: string, doc: string): ExploreItem => ({ id, doc, label: id, text: `Verbatim text of ${id}.`, kind: "target" });
const ITEMS = new Map([
  ["FSS_1", item("FSS_1", "FSS")],
  ["NBSAP_3", item("NBSAP_3", "NBSAP")],
]);
const DOCS = [
  { id: "FSS", name: "Food Supply and Security Measures" },
  { id: "NBSAP", name: "National Biodiversity Strategy & Action Plan" },
];

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      pair: {
        targetAId: "FSS_1",
        targetBId: "NBSAP_3",
        alignment: "flagged",
        mechanism: "goal_conflict",
        description: "The FSS expands cropland where the NBSAP protects land.",
      },
      targetA: { id: "FSS_1", text: "Verbatim text of FSS_1.", sourceDocument: "FSS", sourceLabel: "FSS_1" },
      targetB: { id: "NBSAP_3", text: "Verbatim text of NBSAP_3.", sourceDocument: "NBSAP", sourceLabel: "NBSAP_3" },
    }),
  })) as never;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = saved.fetch;
});

describe("PairView", () => {
  it("explains the document codes its AI explanation uses, as the brief's panel does", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <div data-brief>
          <PairView
            countryId="mongolia"
            countryName="Mongolia"
            a="FSS_1"
            b="NBSAP_3"
            partner="NBSAP_3"
            commitments={ITEMS}
            docName={(id) => DOCS.find((d) => d.id === id)?.name ?? id}
            docs={DOCS}
            onCentre={() => {}}
            onClose={() => {}}
          />
        </div>
      </NextIntlClientProvider>,
    );
    expect((await screen.findByTitle("Food Supply and Security Measures")).textContent).toBe("FSS");
    expect(screen.getByTitle("National Biodiversity Strategy & Action Plan").textContent).toBe("NBSAP");
  });
});
