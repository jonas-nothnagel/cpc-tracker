import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import mn from "../../../messages/mn.json";
import { useAmounts } from "./amounts";

function amountsIn(locale: "en" | "mn") {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={locale === "mn" ? mn : en} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
  return renderHook(() => useAmounts(), { wrapper }).result.current;
}

describe("the footprint page's dates", () => {
  it("are spelled in Mongolian on the Mongolian page, the same in every browser", () => {
    const a = amountsIn("mn");
    expect(a.day("2026-06-26T15:04:00Z")).toBe("2026 оны 6-р сарын 26");
    expect(a.month("2026-06")).toBe("2026 оны 6-р сар");
    expect(a.monthShort(Date.UTC(2026, 5, 1))).toBe("6-р сар");
    expect(a.date("2026-06-02")).toBe("2026 оны 6-р сарын 2");
    expect(a.date("2026-06-02", false)).toBe("6-р сарын 2");
  });

  it("stay as Intl writes them elsewhere", () => {
    const a = amountsIn("en");
    expect(a.month("2026-06")).toBe("June 2026");
    expect(a.monthShort(Date.UTC(2026, 5, 1))).toBe("Jun");
    expect(a.date("2026-06-02", false)).toBe("June 2");
  });
});
