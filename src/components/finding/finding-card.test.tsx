import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import en from "../../../messages/en.json";
import type { AlignmentResult, Target } from "@/types";

// next-intl's createNavigation imports next/navigation in a way vitest cannot
// resolve; the card only needs an anchor here.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

import { FindingCard } from "./finding-card";

afterEach(cleanup);

const FLAGGED_PAIR: AlignmentResult = {
  targetAId: "FSS_18",
  targetBId: "NDC_2",
  alignment: "flagged",
  mechanism: "resource_competition",
  manageability: "manageable",
  confidence: "medium",
  contestedResources: ["land"],
  description:
    "The food-system target seeks to expand fodder cultivation while the NDC target expands protected areas, creating plausible competition for land.",
};

const TARGET_A: Target = {
  id: "FSS_18",
  text: "Provide organisational and financial support to increase fodder cultivation and production.",
  sourceDocument: "FSS",
  sourceLabel: "Food supply 18",
  country: "Mongolia",
  isQuantitative: false,
  isTimeBound: false,
  textOriginal: "Тэжээлийн ургамал тариалалтыг нэмэгдүүлэхэд дэмжлэг үзүүлнэ.",
  language: "mn",
  textOriginalSource: "source",
};

const TARGET_B: Target = {
  id: "NDC_2",
  text: "Strengthen protection and sustainable use measures that support the regeneration of vulnerable ecosystems.",
  sourceDocument: "NDC",
  sourceLabel: "Ecosystems 2",
  country: "Mongolia",
  isQuantitative: false,
  isTimeBound: true,
};

const HEADLINE =
  "Possible competition for land between the Food Security Strategy and the NDC";

function renderCard(overrides: Partial<AlignmentResult> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <FindingCard
        pair={{ ...FLAGGED_PAIR, ...overrides }}
        targetA={TARGET_A}
        targetB={TARGET_B}
        countryConfig={null}
        countryId="mongolia"
        headline={HEADLINE}
      />
    </NextIntlClientProvider>,
  );
}

describe("FindingCard", () => {
  it("renders the claim as the page heading", () => {
    renderCard();
    expect(
      screen.getByRole("heading", { level: 1, name: HEADLINE }),
    ).toBeTruthy();
  });

  it("shows both target texts verbatim", () => {
    renderCard();
    expect(screen.getByText(TARGET_A.text)).toBeTruthy();
    expect(screen.getByText(TARGET_B.text)).toBeTruthy();
  });

  it("labels the AI rationale and keeps the disclaimer", () => {
    renderCard();
    expect(screen.getByText(en.briefing.drawer.pair.aiRationaleLabel)).toBeTruthy();
    expect(screen.getByText(FLAGGED_PAIR.description)).toBeTruthy();
    expect(
      screen.getByText(en.briefing.drawer.pair.aiRationaleDisclaimer),
    ).toBeTruthy();
  });

  it("explains the mechanism with the shared human-authored description", () => {
    renderCard();
    expect(
      screen.getByText(en.labels.contradictionDescription.resource_competition),
    ).toBeTruthy();
  });

  it("omits the mechanism explanation for non-flagged pairs", () => {
    renderCard({
      alignment: "medium",
      mechanism: undefined,
      manageability: undefined,
      confidence: undefined,
      contestedResources: undefined,
    });
    expect(
      screen.queryByText(en.labels.contradictionDescription.resource_competition),
    ).toBeNull();
  });

  it("copies the page link on request", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: en.finding.card.copyLink }));
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(await screen.findByText(en.finding.card.copied)).toBeTruthy();
  });
});
