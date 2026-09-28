import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { setupFixture } from "@/lib/brief/contracts/test-fixture";
import { MisalignedBlock } from "./misaligned-block";
import { SynergyBlock } from "./synergy-block";
import { TargetsBlock } from "./targets-block";

const wrap = (node: ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <div data-brief>{node}</div>
    </NextIntlClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AI labels", () => {
  it("tags the targets and what works well as AI readings", () => {
    wrap(
      <>
        <TargetsBlock setup={setupFixture()} onTarget={vi.fn()} />
        <SynergyBlock setup={setupFixture()} onContract={vi.fn()} />
      </>,
    );
    expect(screen.getAllByText("AI reading: each contract compared with the targets")).toHaveLength(2);
  });
});

describe("the targets", () => {
  it("states how many targets have a strongly matching contract, in numbers", () => {
    wrap(<TargetsBlock setup={setupFixture()} onTarget={vi.fn()} />);
    expect(
      screen.getByRole("heading", {
        name: "5 of the 6 targets have a strongly matching contract; 1 has none",
      }),
    ).toBeInTheDocument();
  });

  it("names a target without a contract under its document, with what else is behind it", () => {
    const onTarget = vi.fn();
    wrap(<TargetsBlock setup={setupFixture()} onTarget={onTarget} />);
    const row = screen.getByTestId("targets-doc-C");
    expect(within(row).getByText("1 of 2")).toBeInTheDocument();
    expect(within(row).getByText(/Reform harmful subsidies/)).toBeInTheDocument();
    expect(within(row).getByText("budget line")).toBeInTheDocument();
    fireEvent.click(within(row).getByText(/Reform harmful subsidies/));
    expect(onTarget).toHaveBeenCalledWith("C2");
  });
});

describe("what works well", () => {
  it("lists the contracts serving three documents or more, the documents named in words", () => {
    const onContract = vi.fn();
    wrap(<SynergyBlock setup={setupFixture()} onContract={onContract} />);
    expect(
      screen.getByRole("heading", {
        name: "1 contract, worth ₮10 billion, strongly matches targets in 3 or more documents at once",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 documents: Document A, Document B, Document C")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Contract p1"));
    expect(onContract).toHaveBeenCalledWith("p1");
  });

  it("marks a title not yet translated in the list", () => {
    const setup = setupFixture();
    const p1 = setup.file.contracts.find((c) => c.id === "p1")!;
    p1.title = "Ногоон бүс";
    p1.translated = false;
    wrap(<SynergyBlock setup={setup} onContract={vi.fn()} />);
    expect(screen.getByText("Ногоон бүс")).toHaveAttribute("lang", "mn");
  });

  it("states the policy analysis on their pairs of targets", () => {
    wrap(<SynergyBlock setup={setupFixture()} onContract={vi.fn()} />);
    expect(
      screen.getByText(
        "Of the 3 pairs of targets they serve, the policy analysis rates 1 strongly aligned and 1 potentially misaligned.",
      ),
    ).toBeInTheDocument();
  });
});

describe("contracts on a policy fault line", () => {
  it("lists them page by page, never cut silently, each with its pairs counted", () => {
    const setup = setupFixture();
    const ids = setup.file.contracts.map((c) => c.id);
    setup.file.faultline = Array.from({ length: 20 }, (_, i) => ({
      contract: ids[i % ids.length],
      pairs:
        i === 0
          ? ([
              ["A1", "C1"],
              ["B1", "C1"],
            ] as [string, string][])
          : ([["A1", "C1"]] as [string, string][]),
    }));
    wrap(<SynergyBlock setup={setup} onContract={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /20 contracts serve two targets/ }));
    const list = screen.getByTestId("faultline-list");
    expect(within(list).getAllByRole("button")).toHaveLength(8);
    expect(within(list).getByText("and 1 more pair")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 12 more" }));
    expect(within(screen.getByTestId("faultline-list")).getAllByRole("button")).toHaveLength(20);
  });
});

describe("where to look closer", () => {
  it("counts the lots of one tender once, beside the target's strongly matching tenders", () => {
    wrap(<MisalignedBlock setup={setupFixture()} onContract={vi.fn()} onTarget={vi.fn()} />);
    expect(
      screen.getByRole("heading", {
        name: "1 tender is potentially misaligned with a target; for 100% of them, the target is in Document C",
      }),
    ).toBeInTheDocument();
    const row = screen.getByTestId("misaligned-C1");
    expect(within(row).getByText("1")).toBeInTheDocument();
    expect(within(row).getByText("2")).toBeInTheDocument();
  });

  it("labels both sides of the bars, on the bars' own grid", () => {
    wrap(<MisalignedBlock setup={setupFixture()} onContract={vi.fn()} onTarget={vi.fn()} />);
    const left = screen.getByText("tenders potentially misaligned");
    const right = screen.getByText("strongly matching");
    for (const label of [left, right]) {
      expect(label.closest("[aria-hidden='true']")).toBeNull();
      expect(label.closest(".ct-flow-bars")).not.toBeNull();
    }
  });

  it("shows why a tender was raised: the AI explanation's first sentence, its kind and confidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          misaligned: [
            {
              contract: "n1",
              text: "Coal hauled by road runs against the rail shift. Details follow.",
              confidence: "high",
              mechanism: "goal_conflict",
            },
          ],
        }),
      })),
    );
    wrap(<MisalignedBlock setup={setupFixture()} onContract={vi.fn()} onTarget={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Shift freight to rail/ }));
    expect(await screen.findByText(/Coal hauled by road runs against the rail shift\./)).toBeInTheDocument();
    expect(screen.getByText("Conflicting goals · High confidence")).toBeInTheDocument();
  });

  it("opens a target's tenders with their contracts and the review tag", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ misaligned: [] }) })),
    );
    const onContract = vi.fn();
    wrap(<MisalignedBlock setup={setupFixture()} onContract={onContract} onTarget={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Shift freight to rail/ }));
    expect(within(screen.getByTestId("misaligned-C1")).getByText(/3 contracts ·/)).toBeInTheDocument();
    expect(screen.getByText("AI-identified, for review")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Contract n1"));
    expect(onContract).toHaveBeenCalledWith("n1");
  });
});
