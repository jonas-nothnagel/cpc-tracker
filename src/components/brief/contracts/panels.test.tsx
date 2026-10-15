import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import es from "../../../../messages/es.json";
import { setupFixture } from "@/lib/brief/contracts/test-fixture";
import { scopeSetup, type ContractsSetup } from "@/lib/brief/contracts/setup";
import type { ContractRecord } from "@/lib/brief/contracts/model";
import { ContractsPanels } from "./panels";
import type { PanelState } from "./contracts-page";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

const RECORD: ContractRecord = {
  id: "p1",
  original: "Ногоон бүсийг ойжуулах",
  english: "Afforestation of the green belt",
  buyer: "Ховд аймгийн Худалдан авах ажиллагааны газар",
  buyerEnglish: "Khovd aimag Procurement Agency",
  code: "ABC/2024/1",
  type: "works",
  stage: "approved",
  start: "2024-04-15",
  end: "2024-07-01",
  url: "https://www.tender.gov.mn/mn/contract/p1",
  reason: "Ойжуулалт нь байгаль орчны зорилготой.",
  reasonEnglish: "Afforestation has an environmental objective.",
  lots: 1,
  strong: [
    {
      target: "A1",
      text: "The contract plants trees that cut waste emissions. More detail follows here.",
    },
  ],
  misaligned: [],
};

function renderPanels(
  stack: PanelState[],
  onPush = vi.fn(),
  opts: { onExplore?: (id: string) => void; locale?: "en" | "es"; setup?: ContractsSetup } = {},
) {
  const locale = opts.locale ?? "en";
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en} timeZone="UTC">
      <div data-brief>
        <ContractsPanels
          stack={stack}
          setup={opts.setup ?? setupFixture()}
          onPush={onPush}
          onBack={vi.fn()}
          onClose={vi.fn()}
          onExplore={opts.onExplore}
        />
      </div>
    </NextIntlClientProvider>,
  );
  return { onPush };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a contract, in full", () => {
  it("reads as a public procurement contract: its record in English, then the pipeline's reading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => RECORD })),
    );
    renderPanels([{ kind: "contract", id: "p1" }]);
    expect(await screen.findByRole("heading", { name: "Afforestation of the green belt" })).toBeInTheDocument();
    expect(screen.getByText("Public procurement contract")).toBeInTheDocument();
    expect(screen.getByText("₮10 billion")).toBeInTheDocument();
    // English only: the buyer and the reason in English, nothing in Mongolian.
    expect(screen.getByText("Khovd aimag Procurement Agency")).toBeInTheDocument();
    expect(screen.queryByText(/Ногоон бүсийг ойжуулах/)).toBeNull();
    expect(screen.queryByText(/Ойжуулалт/)).toBeNull();
    expect(screen.queryByText(/Ховд аймгийн/)).toBeNull();
    const reading = screen.getByRole("region", { name: "The pipeline's reading" });
    expect(within(reading).getByText("Mainly for nature or climate")).toBeInTheDocument();
    expect(within(reading).getByText("Afforestation has an environmental objective.")).toBeInTheDocument();
    expect(within(reading).getByText("Pollution management")).toBeInTheDocument();
    expect(within(reading).getByText("Waste")).toBeInTheDocument();
    expect(within(reading).getByText("1 strongly matching")).toBeInTheDocument();
    expect(within(reading).getByRole("button", { name: /Cut emissions from waste/ })).toBeInTheDocument();
    const source = screen.getByRole("link", { name: /View on tender\.gov\.mn/ });
    expect(source).toHaveAttribute("href", RECORD.url);
  });

  it("leaves out a buyer or a reason that has no English, rather than show the Mongolian", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ ...RECORD, buyerEnglish: null, reasonEnglish: null }) })),
    );
    renderPanels([{ kind: "contract", id: "p1" }]);
    expect(await screen.findByRole("heading", { name: "Afforestation of the green belt" })).toBeInTheDocument();
    expect(screen.queryByText("Buyer")).toBeNull();
    expect(screen.queryByText(/Ховд аймгийн/)).toBeNull();
    expect(screen.queryByText(/Ойжуулалт/)).toBeNull();
  });

  it("names only the targets in the brief's documents, each one the ring can take", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ...RECORD,
          strong: [...RECORD.strong, { target: "C1", text: "It also shifts freight to rail." }],
          misaligned: [{ target: "C1", text: "It may pull against rail freight.", confidence: "high", mechanism: null }],
        }),
      })),
    );
    renderPanels([{ kind: "contract", id: "p1" }], vi.fn(), { setup: scopeSetup(setupFixture(), ["A", "B"]) });
    const reading = await screen.findByRole("region", { name: "The pipeline's reading" });
    expect(within(reading).getByText("1 strongly matching")).toBeInTheDocument();
    expect(within(reading).queryByText(/potentially misaligned/)).toBeNull();
    expect(within(reading).queryByRole("button", { name: /Shift freight to rail/ })).toBeNull();
    expect(within(reading).getByRole("button", { name: /Cut emissions from waste/ })).toBeInTheDocument();
  });

  it("says so when the record cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    renderPanels([{ kind: "contract", id: "p1" }]);
    await waitFor(() => expect(screen.getByText("The contract's record could not be loaded.")).toBeInTheDocument());
  });
});

describe("a target, with its contracts", () => {
  it("lists its strongly matching contracts and its potentially misaligned tenders", () => {
    const { onPush } = renderPanels([{ kind: "target", id: "C1" }]);
    expect(screen.getByRole("heading", { name: /Shift freight to rail/ })).toBeInTheDocument();
    expect(screen.getByText("Contract p1")).toBeInTheDocument();
    expect(screen.getByText("Contract s3")).toBeInTheDocument();
    expect(screen.getByText(/3 contracts/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Contract p1"));
    expect(onPush).toHaveBeenCalledWith({ kind: "contract", id: "p1" });
  });

  it("takes the target to the ring's own page, in the reader's language", () => {
    renderPanels([{ kind: "target", id: "C1" }]);
    expect(screen.getByRole("link", { name: /Explore this target/ })).toHaveAttribute("href", "/mongolia/brief/explore?focus=C1");
    cleanup();
    renderPanels([{ kind: "target", id: "C1" }], vi.fn(), { locale: "es" });
    expect(screen.getByRole("link", { name: /Explorar esta meta/ })).toHaveAttribute("href", "/es/mongolia/brief/explore?focus=C1");
  });

  it("puts the target in the centre of the ring on the same page where the brief has one", () => {
    const onExplore = vi.fn();
    renderPanels([{ kind: "target", id: "C1" }], vi.fn(), { onExplore });
    expect(screen.queryByRole("link", { name: /Explore this target/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Explore this target/ }));
    expect(onExplore).toHaveBeenCalledWith("C1");
  });

  it("keeps budget lines and reported actions off this page", () => {
    renderPanels([{ kind: "target", id: "C2" }]);
    expect(screen.getByText("No strongly matching contract")).toBeInTheDocument();
    expect(screen.queryByText("71404 Water resources")).toBeNull();
    expect(screen.queryByText(/Also behind this target/)).toBeNull();
  });
});

describe("a list of contracts", () => {
  it("lists them by value, marks a title not yet translated, and opens one in full", () => {
    const setup = setupFixture();
    const p3 = setup.file.contracts.find((c) => c.id === "p3")!;
    p3.title = "Бэлчээр хамгаалах";
    p3.translated = false;
    const onPush = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <div data-brief>
          <ContractsPanels stack={[{ kind: "list", title: "Contracts for Restoration", ids: ["p3", "p1", "p2"] }]} setup={setup} onPush={onPush} onBack={vi.fn()} onClose={vi.fn()} />
        </div>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Contracts for Restoration" })).toBeInTheDocument();
    const rows = screen.getAllByRole("button").filter((b) => b.classList.contains("ct-list-row"));
    expect(rows.map((b) => b.textContent)).toEqual([
      expect.stringContaining("Contract p1"),
      expect.stringContaining("Contract p2"),
      expect.stringContaining("Бэлчээр хамгаалах"),
    ]);
    expect(screen.getByText("Бэлчээр хамгаалах")).toHaveAttribute("lang", "mn");
    fireEvent.click(rows[0]);
    expect(onPush).toHaveBeenCalledWith({ kind: "contract", id: "p1" });
  });
});
