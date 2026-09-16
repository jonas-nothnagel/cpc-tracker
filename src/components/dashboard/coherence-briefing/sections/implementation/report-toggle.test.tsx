import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../../messages/en.json";
import { ReportToggle } from "./report-toggle";

afterEach(cleanup);

describe("ReportToggle", () => {
  it("names both reports in full, marks the current one pressed, and reports a switch", () => {
    const onChange = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ReportToggle report="btr" onChange={onChange} />
      </NextIntlClientProvider>,
    );
    const group = screen.getByRole("group", { name: "Choose a report" });
    expect(group).toHaveAttribute("data-tour", "report-toggle");
    const climate = screen.getByRole("button", { name: "Climate report (BTR)" });
    const bio = screen.getByRole("button", { name: "Biodiversity report (NR7)" });
    expect(climate).toHaveAttribute("aria-pressed", "true");
    expect(bio).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(bio);
    expect(onChange).toHaveBeenCalledWith("nr7");
  });
});
