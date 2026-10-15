import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { scopeOf } from "@/lib/brief/compute";
import { buildBriefData } from "@/lib/brief/data";
import { briefFixture } from "@/lib/brief/test-fixture";
import { AreasView } from "./areas-view";

// The ring a pointed-at list target gets is drawn on canvas; read what the
// picture is told instead.
const seen = vi.hoisted(() => [] as (string | null)[]);
vi.mock("./area-field", () => ({
  AreaField: (props: { pointed: string | null }) => {
    seen.push(props.pointed);
    return null;
  },
}));

const SOURCE = briefFixture();
const DATA = buildBriefData(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), "globe");
const pointed = () => seen[seen.length - 1];

afterEach(() => {
  cleanup();
  seen.length = 0;
});

describe("AreasView and the picture's ring", () => {
  it("forgets a target pointed at in the list once it is picked, and after going back", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <AreasView source={SOURCE} data={DATA} lens="globe" onLens={vi.fn()} onExplore={vi.fn()} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(within(screen.getAllByTestId("brief-area-pair")[1]).getByRole("button", { expanded: false }));
    const c1 = screen.getAllByTestId("brief-area-target").find((t) => t.textContent?.includes("Commitment C1"))!;
    fireEvent.pointerEnter(c1);
    expect(pointed()).toBe("C1");
    fireEvent.click(c1);
    expect(pointed()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to Agriculture · Water" }));
    expect(pointed()).toBeNull();
  });
});
