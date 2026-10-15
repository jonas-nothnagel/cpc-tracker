import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { emptyFocus, type Focus } from "@/lib/brief/contracts/focus";
import type { Contract } from "@/lib/brief/contracts/model";
import { setupFixture } from "@/lib/brief/contracts/test-fixture";
import { CloserBlock } from "./closer-block";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderBlock(opts: { focus?: Partial<Focus>; extra?: Contract[] } = {}) {
  const setup = setupFixture();
  if (opts.extra) setup.file.contracts.push(...opts.extra);
  const onContract = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <div data-brief>
        <CloserBlock setup={setup} focus={{ ...emptyFocus("globe"), ...opts.focus }} onContract={onContract} />
      </div>
    </NextIntlClientProvider>,
  );
  return { onContract };
}

const coal: Contract = {
  id: "n5",
  tender: "t12",
  year: 2025,
  tier: "none",
  value: 2e9,
  title: "Coal for heating",
  translated: true,
  place: "MN-1",
  areas: {},
  matches: [],
  misaligned: ["A1"],
};

describe("where to look closer", () => {
  it("counts the lots of one tender once, beside the target's strongly matching tenders", () => {
    renderBlock();
    const row = screen.getByTestId("closer-row-C1");
    expect(row.dataset.mis).toBe("1");
    expect(row.dataset.match).toBe("2");
  });

  it("states the tenders and their targets in numbers", () => {
    renderBlock();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "1 tender is potentially misaligned with a target; for 100% of them, the target is in C",
    );
    expect(screen.getByText(/strongly matching tenders outnumber/).textContent).toBe(
      "For this target, the strongly matching tenders outnumber them. 1 other target has no strongly matching contract at all.",
    );
  });

  it("gathers the targets no contract strongly matches, one line each under its document", () => {
    renderBlock();
    const gaps = screen.getByRole("group", { name: "No strongly matching contract anywhere" });
    expect(within(gaps).getByRole("term").textContent).toBe("C");
    const line = within(gaps).getByRole("button", { name: "2 Reform harmful subsidies" });
    // The line is cut at the column's edge; the whole target is on hover.
    expect(line).toHaveAttribute("title", "2 Reform harmful subsidies");
    expect(within(gaps).queryByText("C · 1")).toBeNull();
  });

  it("merges tenders with the same title at rest, and one opens its target with that tender first", () => {
    renderBlock({ extra: [{ ...coal, misaligned: ["C1"] }, { ...coal, id: "n6", tender: "t13", misaligned: ["C1"] }] });
    const line = screen.getByRole("button", { name: "Coal for heating" });
    expect(line.parentElement?.textContent).toContain("2 tenders · 2 contracts · 2025 · 1 target");
    fireEvent.click(line);
    const side = document.querySelector<HTMLElement>(".ct-closer-side")!;
    expect(within(side).getByRole("heading", { level: 3 }).textContent).toBe("C · 1 Shift freight to rail");
    const tenders = document.querySelectorAll(".ct-closer-tender");
    expect(tenders[0].textContent).toContain("Coal for heating");
  });

  it("shows why a tender was raised: the AI's first sentence and its confidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ misaligned: [{ contract: "n1", text: "The tender adds coal capacity. More detail follows.", confidence: "high", mechanism: null }] }),
      })),
    );
    renderBlock();
    fireEvent.click(screen.getByRole("button", { name: /^C · 1/ }));
    await waitFor(() => expect(screen.getByText("The tender adds coal capacity.")).toBeInTheDocument());
    expect(screen.getByText("High confidence")).toBeInTheDocument();
  });

  it("never shows a late answer for one target under another, even for a contract both share", async () => {
    const answers: ((v: unknown) => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            answers.push(resolve);
          }),
      ),
    );
    const setup = setupFixture();
    // Lot n1 of tender t10 is potentially misaligned with C1 and with A1.
    setup.file.contracts.find((c) => c.id === "n1")!.misaligned = ["C1", "A1"];
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <div data-brief>
          <CloserBlock setup={setup} focus={emptyFocus("globe")} onContract={vi.fn()} />
        </div>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^C · 1/ }));
    fireEvent.click(screen.getByRole("button", { name: /^A · 1/ }));
    await act(async () => {
      answers[0]({ ok: true, json: async () => ({ misaligned: [{ contract: "n1", text: "About freight to rail.", confidence: "high", mechanism: null }] }) });
    });
    expect(screen.queryByText("About freight to rail.")).toBeNull();
  });

  it("names the page's focus above its finding", () => {
    renderBlock({ focus: { doc: "C" } });
    expect(screen.getByText("Focus: Document C")).toBeInTheDocument();
  });

  it("answers the page's focus: a document keeps its own targets", () => {
    renderBlock({ focus: { doc: "C" }, extra: [coal] });
    expect(screen.queryByTestId("closer-row-A1")).toBeNull();
    expect(screen.getByTestId("closer-row-C1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("1 tender is potentially misaligned with C targets");
  });
});
