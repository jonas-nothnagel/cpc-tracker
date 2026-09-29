import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import { emptyFocus } from "@/lib/brief/contracts/focus";
import { setupFixture } from "@/lib/brief/contracts/test-fixture";
import { FocusBar } from "./focus-bar";

afterEach(cleanup);

function renderBar(focus = emptyFocus("globe")) {
  const onFocus = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <FocusBar setup={setupFixture()} focus={focus} placeNames={{ "MN-043": "Khovd" }} onFocus={onFocus} />
    </NextIntlClientProvider>,
  );
  return onFocus;
}

describe("the focus line", () => {
  it("says the whole record while nothing is in focus", () => {
    renderBar();
    expect(screen.getByRole("group", { name: "Focus" }).textContent).toBe("Focusthe whole record");
  });

  it("names each part in focus and lets each go on its own", () => {
    const onFocus = renderBar({ ...emptyFocus("globe"), area: "g_restoration", doc: "C", place: "MN-043" });
    expect(screen.getByRole("group", { name: "Focus" }).textContent).toBe("FocusRestoration✕Document C✕Khovd✕");
    fireEvent.click(screen.getByRole("button", { name: "Clear Document C" }));
    expect(onFocus).toHaveBeenCalledWith({ doc: null });
  });
});
