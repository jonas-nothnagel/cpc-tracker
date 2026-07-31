import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { DocHoverCard } from "./doc-meta-card";
import { ViewTargetsAction } from "./view-targets-action";
import type { CountryConfig } from "@/types";

afterEach(cleanup);

const COUNTRY_CONFIG = {
  documentTypes: [
    {
      id: "NAP",
      shortLabel: "NAP",
      mediumLabel: "NAP",
      fullLabel: "National Adaptation Plan",
      color: "#b45309",
      docKind: "National Adaptation Plan (UNFCCC)",
      published: "March 2025",
      author: "Ministry of Environment and Climate Change",
      url: "https://unfccc.int/nap",
    },
  ],
} as unknown as CountryConfig;

function renderLegendChip({
  onViewTargets = vi.fn(),
  count = 15,
}: { onViewTargets?: () => void; count?: number } = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DocHoverCard
        doc="NAP"
        countryConfig={COUNTRY_CONFIG}
        footer={<ViewTargetsAction count={count} onClick={onViewTargets} />}
      >
        <button type="button">NAP</button>
      </DocHoverCard>
      <button type="button">Next legend chip</button>
    </NextIntlClientProvider>,
  );
  return { chip: screen.getByRole("button", { name: "NAP" }), onViewTargets };
}

const targetsAction = () =>
  screen.queryByRole("button", { name: /15 targets/ });

describe("DocHoverCard with a targets action", () => {
  it("stays closed until the pointer arrives", () => {
    renderLegendChip();
    expect(targetsAction()).toBeNull();
  });

  it("offers the action on hover", () => {
    const { chip, onViewTargets } = renderLegendChip();
    fireEvent.mouseEnter(chip.parentElement as HTMLElement);
    const action = targetsAction();
    expect(action).toBeInTheDocument();
    fireEvent.click(action as HTMLElement);
    expect(onViewTargets).toHaveBeenCalledTimes(1);
  });

  it("opens on focus so the card is reachable without a pointer", () => {
    const { chip } = renderLegendChip();
    fireEvent.focus(chip);
    expect(targetsAction()).toBeInTheDocument();
  });

  it("moves Tab into the card, which the portal would otherwise put last", () => {
    const { chip } = renderLegendChip();
    fireEvent.focus(chip);
    fireEvent.keyDown(chip, { key: "Tab" });
    // The document link comes first in the card, then the targets action.
    expect(document.activeElement).toHaveAccessibleName(/View document/);
  });

  it("returns focus to the chip when tabbing back out of the card", () => {
    const { chip } = renderLegendChip();
    fireEvent.focus(chip);
    fireEvent.keyDown(chip, { key: "Tab" });
    const link = document.activeElement as HTMLElement;
    fireEvent.keyDown(link, { key: "Tab", shiftKey: true });
    expect(chip).toHaveFocus();
    expect(targetsAction()).toBeNull();
  });

  it("returns focus to the chip rather than stranding it past the last item", () => {
    const { chip } = renderLegendChip();
    fireEvent.focus(chip);
    fireEvent.keyDown(chip, { key: "Tab" });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab" });
    const action = targetsAction() as HTMLElement;
    action.focus();
    fireEvent.keyDown(action, { key: "Tab" });
    expect(chip).toHaveFocus();
    expect(targetsAction()).toBeNull();
  });

  it("dismisses on Escape and puts focus back on the chip", () => {
    const { chip } = renderLegendChip();
    fireEvent.focus(chip);
    fireEvent.keyDown(chip, { key: "Escape" });
    expect(targetsAction()).toBeNull();
    expect(chip).toHaveFocus();
  });

  it("is not a tooltip, since a tooltip may not hold interactive content", () => {
    const { chip } = renderLegendChip();
    fireEvent.focus(chip);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("omits the action for a document with no extracted targets", () => {
    renderLegendChip({ count: 0 });
    fireEvent.focus(screen.getByRole("button", { name: "NAP" }));
    expect(screen.queryByRole("button", { name: /targets/ })).toBeNull();
    // The reference metadata is still worth showing.
    expect(screen.getByText("March 2025 · Ministry of Environment and Climate Change")).toBeInTheDocument();
  });
});
