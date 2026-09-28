import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { setupFixture } from "@/lib/brief/contracts/test-fixture";
import type { ContractRecord } from "@/lib/brief/contracts/model";
import { ContractsPanels } from "./panels";
import type { PanelState } from "./contracts-page";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));
// next-intl's createNavigation imports next/navigation in a way vitest cannot
// resolve; the panel only needs an anchor here (as in finding-card.test).
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

const RECORD: ContractRecord = {
  id: "p1",
  original: "Ногоон бүсийг ойжуулах",
  english: "Afforestation of the green belt",
  buyer: "Khovd aimag procurement office",
  code: "ABC/2024/1",
  type: "works",
  stage: "approved",
  start: "2024-04-15",
  end: "2024-07-01",
  url: "https://www.tender.gov.mn/mn/contract/p1",
  reason: "Ойжуулалт нь байгаль орчны зорилготой.",
  lots: 1,
  strong: [
    {
      target: "A1",
      text: "The contract plants trees that cut waste emissions. More detail follows here.",
    },
  ],
  misaligned: [],
};

function renderPanels(stack: PanelState[], onPush = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <div data-brief>
        <ContractsPanels stack={stack} setup={setupFixture()} onPush={onPush} onBack={vi.fn()} onClose={vi.fn()} />
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
  it("shows the record, its readings and the way to its source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => RECORD })),
    );
    renderPanels([{ kind: "contract", id: "p1" }]);
    expect(
      await screen.findByRole("heading", {
        name: "Afforestation of the green belt",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ногоон бүсийг ойжуулах/)).toBeInTheDocument();
    expect(screen.getByText("Khovd aimag procurement office")).toBeInTheDocument();
    expect(screen.getByText("Mainly for nature or climate")).toBeInTheDocument();
    expect(screen.getByText(/Cut emissions from waste/)).toBeInTheDocument();
    expect(screen.getByText(/The contract plants trees that cut waste emissions\./)).toBeInTheDocument();
    const source = screen.getByRole("link", {
      name: /View on tender\.gov\.mn/,
    });
    expect(source).toHaveAttribute("href", RECORD.url);
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

  it("names what else is behind a target without a contract", () => {
    renderPanels([{ kind: "target", id: "C2" }]);
    expect(screen.getByText("No strongly matching contract")).toBeInTheDocument();
    expect(screen.getByText("71404 Water resources")).toBeInTheDocument();
  });
});
