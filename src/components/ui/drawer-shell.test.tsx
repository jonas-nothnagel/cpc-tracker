import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { DrawerHeader, DrawerShell } from "./drawer-shell";

// jsdom runs no animation frames by default; the shell focuses its header in one.
beforeAll(() => {
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame;
});

// Without vitest globals, testing-library's auto-cleanup does not run.
afterEach(cleanup);

function renderShell({
  onClose = vi.fn(),
  onBack,
  withInput = false,
}: {
  onClose?: () => void;
  onBack?: () => void;
  withInput?: boolean;
} = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DrawerShell
        open
        onClose={onClose}
        onBack={onBack}
        dialogLabel="Pair detail"
        panelKey="target-pair:A|B"
      >
        <DrawerHeader
          toolbar={
            withInput ? (
              <input type="search" aria-label="Search these targets" />
            ) : undefined
          }
        >
          <h3>Potential misalignment</h3>
        </DrawerHeader>
        <div>
          <button type="button">A row</button>
        </div>
      </DrawerShell>
    </NextIntlClientProvider>,
  );
  return { onClose };
}

describe("DrawerShell chrome", () => {
  it("renders a labelled modal dialog", () => {
    renderShell();
    const dialog = screen.getByRole("dialog", { name: "Pair detail" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("shows no back row at the root of a trail", () => {
    renderShell();
    expect(screen.queryByRole("button", { name: "Go back" })).toBeNull();
  });

  it("shows a contextual back row when there is somewhere to go back to", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DrawerShell
          open
          onClose={vi.fn()}
          onBack={vi.fn()}
          backLabel="Back to Agriculture"
          dialogLabel="Pair detail"
        >
          <DrawerHeader>
            <h3>Potential misalignment</h3>
          </DrawerHeader>
        </DrawerShell>
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Go back" }),
    ).toHaveTextContent("Back to Agriculture");
  });

  it("locks page scroll while open and restores it on close", () => {
    document.body.style.overflow = "visible";
    const { unmount } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DrawerShell open onClose={vi.fn()} dialogLabel="Pair detail">
          <DrawerHeader>
            <h3>Potential misalignment</h3>
          </DrawerHeader>
        </DrawerShell>
      </NextIntlClientProvider>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("visible");
  });
});

describe("DrawerShell keyboard navigation", () => {
  it("closes on Escape at the root of a trail", () => {
    const onClose = vi.fn();
    renderShell({ onClose });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("steps back on Escape rather than closing when deeper in a trail", () => {
    const onClose = vi.fn();
    const onBack = vi.fn();
    renderShell({ onClose, onBack });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("steps back on Alt+Left, Cmd+Left and Backspace", () => {
    const onBack = vi.fn();
    renderShell({ onBack });
    fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true });
    fireEvent.keyDown(window, { key: "ArrowLeft", metaKey: true });
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(onBack).toHaveBeenCalledTimes(3);
  });

  it("ignores a bare Left arrow, which belongs to the content", () => {
    const onBack = vi.fn();
    renderShell({ onBack });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onBack).not.toHaveBeenCalled();
  });

  it("does not navigate on the back keys when there is nowhere to go back to", () => {
    const onClose = vi.fn();
    renderShell({ onClose });
    fireEvent.keyDown(window, { key: "Backspace" });
    fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("leaves Backspace and Cmd+Left alone while the caret is in a field", () => {
    const onBack = vi.fn();
    renderShell({ onBack, withInput: true });
    // Fired on the field so it bubbles to the shell the way a real press does.
    const input = screen.getByLabelText("Search these targets");
    fireEvent.keyDown(input, { key: "Backspace" });
    fireEvent.keyDown(input, { key: "ArrowLeft", metaKey: true });
    expect(onBack).not.toHaveBeenCalled();
    // Alt+Left carries no editing meaning, so it still navigates.
    fireEvent.keyDown(input, { key: "ArrowLeft", altKey: true });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("stands down for a handler that already claimed the key", () => {
    const onClose = vi.fn();
    renderShell({ onClose });
    // A nested popover (or the tour overlay) closing itself on the same press.
    const claimed = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
      bubbles: true,
    });
    claimed.preventDefault();
    window.dispatchEvent(claimed);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("stops listening once closed", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DrawerShell open onClose={onClose} dialogLabel="Pair detail">
          <DrawerHeader>
            <h3>Potential misalignment</h3>
          </DrawerHeader>
        </DrawerShell>
      </NextIntlClientProvider>,
    );
    unmount();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("DrawerHeader", () => {
  it("moves focus to the header so a panel change is announced", () => {
    renderShell();
    const heading = screen.getByRole("heading", {
      name: "Potential misalignment",
    });
    expect(heading.parentElement).toHaveFocus();
  });

  it("refuses to render outside a shell, rather than losing the close button", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <NextIntlClientProvider locale="en" messages={en}>
          <DrawerHeader>
            <h3>Orphan</h3>
          </DrawerHeader>
        </NextIntlClientProvider>,
      ),
    ).toThrow(/inside a DrawerShell/);
    spy.mockRestore();
  });
});
