import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WorkbenchRail } from "./workbench-rail";
import type { RailMode } from "./rail-mode";

afterEach(cleanup);

const base = {
  eyebrow: "At a glance",
  backLabel: "Back to summary",
  body: <p>rail body</p>,
  footer: (
    <div data-tour="explore-ask">
      <input aria-label="Ask the policies" />
    </div>
  ),
};

describe("WorkbenchRail", () => {
  it("shows the eyebrow and no way back while the summary is on", () => {
    render(<WorkbenchRail mode="summary" onBack={vi.fn()} {...base} />);
    expect(screen.getByText("At a glance")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back to summary" })).toBeNull();
  });

  it("offers a way back to the summary while an answer or a detail is on", () => {
    for (const mode of ["answer", "detail"] as RailMode[]) {
      const onBack = vi.fn();
      render(<WorkbenchRail mode={mode} onBack={onBack} {...base} />);
      fireEvent.click(screen.getByRole("button", { name: "Back to summary" }));
      expect(onBack).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });

  it("keeps exactly one ask input mounted in every mode", () => {
    for (const mode of ["summary", "answer", "detail"] as RailMode[]) {
      render(<WorkbenchRail mode={mode} onBack={vi.fn()} {...base} />);
      expect(document.querySelectorAll('[data-tour="explore-ask"] input')).toHaveLength(1);
      expect(screen.getByText("rail body")).toBeTruthy();
      cleanup();
    }
  });
});
