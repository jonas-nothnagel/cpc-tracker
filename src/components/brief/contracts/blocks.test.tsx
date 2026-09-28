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

afterEach(cleanup);

describe("the targets", () => {
  it("states how many targets have a strongly matching contract, in numbers", () => {
    wrap(<TargetsBlock setup={setupFixture()} onTarget={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "5 of the 6 targets have a strongly matching contract; 1 has none" })).toBeInTheDocument();
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
      screen.getByRole("heading", { name: "1 contract, worth ₮10 billion, strongly matches targets in 3 or more documents at once" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 documents: Document A, Document B, Document C")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Contract p1"));
    expect(onContract).toHaveBeenCalledWith("p1");
  });

  it("states the policy analysis on their pairs of targets", () => {
    wrap(<SynergyBlock setup={setupFixture()} onContract={vi.fn()} />);
    expect(
      screen.getByText("Of the 3 pairs of targets they serve, the policy analysis rates 1 strongly aligned and 1 potentially misaligned."),
    ).toBeInTheDocument();
  });
});

describe("where to look closer", () => {
  it("counts the lots of one tender once, beside the target's strongly matching tenders", () => {
    wrap(<MisalignedBlock setup={setupFixture()} onContract={vi.fn()} onTarget={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "1 tender is potentially misaligned with a target; 100% of them with targets of Document C" }),
    ).toBeInTheDocument();
    const row = screen.getByTestId("misaligned-C1");
    expect(within(row).getByText("1")).toBeInTheDocument();
    expect(within(row).getByText("2")).toBeInTheDocument();
  });

  it("opens a target's tenders with their contracts and the review tag", () => {
    const onContract = vi.fn();
    wrap(<MisalignedBlock setup={setupFixture()} onContract={onContract} onTarget={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Shift freight to rail/ }));
    expect(within(screen.getByTestId("misaligned-C1")).getByText(/3 contracts ·/)).toBeInTheDocument();
    expect(screen.getByText("AI-identified, for review")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Contract n1"));
    expect(onContract).toHaveBeenCalledWith("n1");
  });
});
