import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { Explanation } from "./ai-text";
import { Comparison, LONG_TEXT, type ComparisonSide } from "./comparison";

afterEach(cleanup);

const FSS: ComparisonSide = {
  label: "3.7 Rice, sugar beet, cash crop expansion",
  text: "Focus on increasing the cultivation of all types of rice, sugar beet and other cash crops.",
  docName: "Food Supply and Security Measures",
  color: "#d97706",
};
const NBSAP: ComparisonSide = {
  label: "3 Protected areas",
  text: "By 2030, 30% of the country's total area will be included in the special protected area network.",
  docName: "National Biodiversity Strategy & Action Plan",
  color: "#0d9488",
};

function renderIn(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <div data-brief>{node}</div>
    </NextIntlClientProvider>,
  );
}

describe("Comparison", () => {
  it("shows the two targets as two stops, each under its document, joined by the rating's line", () => {
    renderIn(<Comparison first={FSS} second={NBSAP} tone="apart" />);
    const line = screen.getByTestId("brief-comparison");
    expect(line.getAttribute("data-tone")).toBe("apart");
    const stops = line.querySelectorAll(".brief-cmp-stop");
    expect(stops).toHaveLength(2);
    expect(within(stops[0] as HTMLElement).getByText("Food Supply and Security Measures")).toBeTruthy();
    expect(within(stops[0] as HTMLElement).getByText("3.7 Rice, sugar beet, cash crop expansion")).toBeTruthy();
    expect(within(stops[1] as HTMLElement).getByText(NBSAP.text)).toBeTruthy();
    // Each stop is marked with its document's colour, as on the map.
    const mark = stops[1].querySelector(".brief-cmp-mark") as HTMLElement;
    expect(mark.style.background).toBe("rgb(13, 148, 136)");
  });

  it("shows a long text a few lines long, the whole of it on request", () => {
    const long = { ...FSS, text: `${"Expand irrigated production capacity. ".repeat(10)}End.` };
    expect(long.text.length).toBeGreaterThan(LONG_TEXT);
    renderIn(<Comparison first={long} second={NBSAP} tone="apart" />);
    const text = screen.getByText(/Expand irrigated production capacity/);
    expect(text.getAttribute("data-clamped")).toBe("true");
    // The toggle says whether the text is open, for screen readers too.
    expect(screen.getByRole("button", { name: "Full text" }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Full text" }));
    expect(text.getAttribute("data-clamped")).toBeNull();
    expect(screen.getByRole("button", { name: "Show less" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(text.getAttribute("data-clamped")).toBe("true");
    // A short text needs no button.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("does not repeat a text that only says its label", () => {
    renderIn(<Comparison first={{ ...FSS, text: FSS.label }} second={NBSAP} tone="reinforce" />);
    expect(screen.getAllByText(FSS.label)).toHaveLength(1);
  });
});

describe("Explanation", () => {
  it("gives the AI's first sentence, its confidence beside the heading, and the rest on request", () => {
    renderIn(
      <Explanation text="Both claim the same land. The FSS expands cropland. The NBSAP protects it." confidence="medium">
        <p>A caveat.</p>
      </Explanation>,
    );
    const heading = screen.getByRole("heading", { name: /^AI explanation/ });
    expect(within(heading).getByText("Medium confidence")).toBeTruthy();
    expect(screen.getByText(/^Both claim the same land\./).textContent).not.toContain("The NBSAP");
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByText(/The NBSAP protects it\./)).toBeTruthy();
    expect(screen.getByText("A caveat.")).toBeTruthy();
  });

  it("explains document codes when it knows the documents", () => {
    renderIn(
      <Explanation text="The FSS expands cropland." docs={[{ id: "FSS", name: "Food Supply and Security Measures" }]} />,
    );
    expect(screen.getByTitle("Food Supply and Security Measures").textContent).toBe("FSS");
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
  });
});
