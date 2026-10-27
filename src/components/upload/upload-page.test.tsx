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

// jsdom does not implement scrollIntoView (a step change scrolls to the step).
Element.prototype.scrollIntoView = vi.fn();

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

const LENSES = [
  { id: "globe" as const, areas: ["Restoration"] },
  { id: "ipcc" as const, areas: ["Energy"] },
  { id: "gga" as const, areas: ["Water"] },
  { id: "hr" as const, areas: ["Gender equality"] },
];

function page(initial: Draft | null, facts = FACTS) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <UploadPage initialDraft={initial} facts={facts} lenses={LENSES} speed={{ pairsPerMinute: 450, gramsPerCall: 0.083 }} />
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
    const { container } = page(null);
    expect(screen.getByRole("heading", { level: 1, name: "New analysis" })).toBeInTheDocument();
    expect(container.querySelector(".brief-drift")).toBeNull();
    const steps = within(screen.getByRole("group", { name: "Steps" })).getAllByRole("button");
    expect(steps.map((b) => [b.textContent, (b as HTMLButtonElement).disabled])).toEqual([
      ["1Policy documents", false],
      ["2Targets", true],
      ["3Policy areas", true],
      ["4Start", true],
    ]);
    expect(screen.getByText("PDF, Word, text or spreadsheet files, up to 50 MB each.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose files" })).toHaveClass("brief-button-primary");
    expect(within(screen.getByRole("group", { name: "The analysis" })).getByText("0 of 150")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read the documents" })).toBeNull();
  });

  it("lists the documents with their names, short names and targets, and sums them up beside", () => {
    page(draft([doc("d1", "NAP", "National Agriculture Policy", {}, 60), doc("d2", "NWRP", "National Water Resource Policy", {}, 33)]));
    expect(screen.getByRole("heading", { level: 1, name: "Sri Lanka" })).toBeInTheDocument();
    expect(screen.getByText("New analysis")).toHaveClass("brief-hero-kicker");
    expect(screen.getByLabelText("Name of NAP.pdf")).toHaveValue("National Agriculture Policy");
    expect(screen.getByLabelText("Short name of National Agriculture Policy")).toHaveValue("NAP");
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Short name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose files" })).toHaveClass("brief-button-quiet");
    expect(screen.getAllByText("60 targets").length).toBeGreaterThan(0);
    const figures = within(screen.getByRole("group", { name: "The analysis" }));
    expect(figures.getByText("93 of 150")).toBeInTheDocument();
    expect(figures.getByText("1,980")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to the targets" })).toBeEnabled();
  });

  it("lets the targets read so far drift behind the title, with a way to pause them", () => {
    const { container } = page(
      draft([doc("d1", "NAP", "National Agriculture Policy", {}, 2), doc("d2", "NDC", "Updated NDC 2021", { state: "reading" })]),
    );
    const drift = container.querySelector(".brief-drift");
    expect(drift).not.toBeNull();
    expect(drift).toHaveAttribute("aria-hidden", "true");
    expect(within(drift as HTMLElement).getAllByText("Target 1").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Pause the moving text" }));
    expect(drift).toHaveAttribute("data-paused", "true");
  });

  it("draws a reading's parts as squares in its document's colour, the part being read pulsing", () => {
    page(
      draft([
        doc("d1", "NDC", "Updated NDC 2021", { state: "reading", part: 3, parts: 9 }),
        doc("d2", "NAP", "National Adaptation Plan", { state: "reading" }),
        doc("d3", "NWRP", "National Water Resource Policy", {}, 4),
      ]),
    );
    const marks = (code: string) => screen.getByLabelText(`Name of ${code}.pdf`).closest("li")!.querySelectorAll(".up-reading-part");
    const parts = marks("NDC");
    expect(parts).toHaveLength(9);
    expect(Array.from(parts).map((p) => (p.hasAttribute("data-current") ? "now" : p.hasAttribute("data-done") ? "done" : "to come"))).toEqual([
      "done", "done", "done", "now", "to come", "to come", "to come", "to come", "to come",
    ]);
    // Before its parts are known, one square pulses.
    expect(marks("NAP")).toHaveLength(1);
    expect(marks("NAP")[0]).toHaveAttribute("data-current");
    expect(marks("NWRP")).toHaveLength(0);
  });

  it("goes on to the start with one document's targets, and says there what is still needed", () => {
    page(draft([doc("d1", "NDC", "Updated NDC 2021", {}, 3)]));
    const start = within(screen.getByRole("group", { name: "Steps" })).getByRole("button", { name: "4Start" });
    expect(start).toBeEnabled();
    fireEvent.click(start);
    expect(screen.getByRole("heading", { level: 2, name: "The analysis" })).toBeInTheDocument();
    expect(screen.getByText("Targets from at least 2 documents are needed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start the analysis" })).toBeDisabled();
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

  it("names a document after its file again when its name is cleared", async () => {
    page(draft([doc("d1", "NDC", "Second NDC", { fileName: "Updated_NDC_2021.pdf" }, 2), doc("d2", "NAP", "NAP", {}, 1)]));
    const name = screen.getByLabelText("Name of Updated_NDC_2021.pdf");
    fireEvent.change(name, { target: { value: "" } });
    fireEvent.blur(name);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      changes: [{ op: "document", id: "d1", name: "Updated NDC 2021" }],
    });
    expect(screen.getByLabelText("Name of Updated_NDC_2021.pdf")).toHaveValue("Updated NDC 2021");
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

  it("says when a change was not saved, on whatever step, and shows what the server has", async () => {
    const d = draft([doc("d1", "NDC", "Updated NDC 2021", {}, 2), doc("d2", "NAP", "NAP", {}, 1)]);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? new Response(JSON.stringify({ error: "boom" }), { status: 500 })
        : new Response(JSON.stringify({ draft: d, ahead: 0 }), { status: 200 }),
    );
    page(d);
    const name = screen.getByLabelText("Name of NDC.pdf");
    fireEvent.change(name, { target: { value: "Second NDC 2025" } });
    fireEvent.blur(name);
    expect(await screen.findByText("The last change was not saved.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Name of NDC.pdf")).toHaveValue("Updated NDC 2021"));
  });

  it("says when the documents could not be read, without an empty file name", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
    page(draft([doc("d1", "NDC", "Updated NDC 2021", { state: "added" })]));
    fireEvent.click(screen.getByRole("button", { name: "Read the documents" }));
    expect(await screen.findByText("The documents could not be read.")).toBeInTheDocument();
  });

  it("makes one draft when two drops arrive before it exists", async () => {
    let created = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/upload") {
        created += 1;
        await new Promise((r) => setTimeout(r, 20));
        return new Response(JSON.stringify({ draft: draft([]) }), { status: 201 });
      }
      return new Response(JSON.stringify({ draft: draft([doc("d1", "NDC", "NDC", { state: "added" })]) }), { status: 200 });
    });
    page(null);
    const drop = screen.getByText("PDF, Word, text or spreadsheet files, up to 50 MB each.").parentElement!;
    const files = (name: string) => ({ dataTransfer: { files: [new File(["%PDF"], name)] } });
    fireEvent.drop(drop, files("a.pdf"));
    fireEvent.drop(drop, files("b.pdf"));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/documents"))).toHaveLength(2));
    expect(created).toBe(1);
  });
});
