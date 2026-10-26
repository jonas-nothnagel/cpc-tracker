import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import en from "../../../messages/en.json";
import type { Draft, DraftDocument } from "@/lib/upload/types";
import { UploadPage } from "./upload-page";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const ID = "3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13";
const FACTS = { model: "gpt-5.4", provider: "Azure OpenAI", publicOnly: true };

function doc(id: string, code: string, name: string, over: Partial<DraftDocument> = {}, n = 0): DraftDocument {
  return {
    id,
    source: "read",
    fileName: `${code}.pdf`,
    name,
    code,
    state: "read",
    targets: Array.from({ length: n }, (_, i) => ({ key: `${id}-${i + 1}`, label: `${i + 1}`, text: `Target ${i + 1}` })),
    ...over,
  };
}

function draft(documents: DraftDocument[]): Draft {
  return {
    id: ID,
    createdAt: "2026-10-26T10:00:00Z",
    updatedAt: "2026-10-26T10:00:00Z",
    country: "Sri Lanka",
    locale: "en",
    documents,
    btr: null,
    ownLens: null,
    footprint: null,
    started: false,
    nextDoc: documents.length + 1,
  };
}

function page(initial: Draft | null, facts = FACTS) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <UploadPage initialDraft={initial} facts={facts} speed={{ pairsPerMinute: 450, gramsPerCall: 0.083 }} />
    </NextIntlClientProvider>,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ draft: null, ahead: 0 }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UploadPage", () => {
  it("opens on the documents, with only that step to go to", () => {
    page(null);
    expect(screen.getByRole("heading", { name: "New analysis" })).toBeInTheDocument();
    const steps = within(screen.getByRole("group", { name: "Steps" })).getAllByRole("button");
    expect(steps.map((b) => [b.textContent, (b as HTMLButtonElement).disabled])).toEqual([
      ["1Policy documents", false],
      ["2Targets", true],
      ["3Policy areas", true],
      ["4Start", true],
    ]);
    expect(screen.getByText("PDF, Word, text or spreadsheet files, up to 50 MB each.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read the documents" })).toBeNull();
  });

  it("lists the documents with their names, short names and targets, and sums them up beside", () => {
    page(draft([doc("d1", "NAP", "National Agriculture Policy", {}, 60), doc("d2", "NWRP", "National Water Resource Policy", {}, 33)]));
    expect(screen.getByRole("heading", { name: "Sri Lanka · new analysis" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name of NAP.pdf")).toHaveValue("National Agriculture Policy");
    expect(screen.getByLabelText("Short name of National Agriculture Policy")).toHaveValue("NAP");
    expect(screen.getAllByText("60 targets").length).toBeGreaterThan(0);
    const figures = within(screen.getByRole("group", { name: "The analysis" }));
    expect(figures.getByText("93 of 150")).toBeInTheDocument();
    expect(figures.getByText("1,980")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to the targets" })).toBeEnabled();
  });

  it("says who reads the documents before anything is read", () => {
    page(draft([doc("d1", "NDC", "Updated NDC 2021", { state: "added" })]));
    expect(screen.getByText(/Documents are read by gpt-5.4 on Azure OpenAI\./)).toBeInTheDocument();
    expect(screen.getByText(/Only public documents can be added\./)).toBeInTheDocument();
  });

  it("reads the documents only when asked", async () => {
    page(draft([doc("d1", "NDC", "Updated NDC 2021", { state: "added" })]));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Read the documents" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/upload/${ID}/read`, expect.objectContaining({ method: "POST" })));
  });

  it("sends a renamed document once the field is left", async () => {
    page(draft([doc("d1", "NDC", "Updated NDC 2021", {}, 2), doc("d2", "NAP", "NAP", {}, 1)]));
    const name = screen.getByLabelText("Name of NDC.pdf");
    fireEvent.change(name, { target: { value: "Second NDC 2025" } });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.blur(name);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/upload/${ID}`);
    expect(JSON.parse(init.body)).toEqual({ changes: [{ op: "document", id: "d1", name: "Second NDC 2025" }] });
  });

  it("shows a reading's parts and a scanned document's way out", () => {
    page(
      draft([
        doc("d1", "NDC", "Updated NDC 2021", { state: "reading", part: 3, parts: 9 }),
        doc("d2", "NPPP", "National Physical Planning Policy", { state: "noText" }),
      ]),
    );
    expect(screen.getAllByText("Reading, part 3 of 9").length).toBeGreaterThan(0);
    const scanned = screen.getByLabelText("Name of NPPP.pdf").closest("li")!;
    expect(within(scanned).getByText("No machine-readable text. A text version is needed.")).toBeInTheDocument();
    expect(within(scanned).getAllByRole("button").map((b) => b.textContent)).toEqual(["Remove"]);
  });
});
