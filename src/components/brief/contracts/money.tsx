"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { moneyParts, per100, toUsd } from "@/lib/brief/contracts/money";
import { mongolianDate } from "@/lib/brief/sheet";

/** The currency the page states amounts in: the record's own (tugrik) or
 *  US$ at the record's indicative rate. */
export type Currency = "mnt" | "usd";

const CurrencyContext = createContext<{ currency: Currency; rate: number; local: boolean }>({
  currency: "usd",
  rate: 0,
  local: false,
});

/** `local`: the page is in the country's own language, the only page where
 *  its own currency appears (by default, with US$ on request). Every other
 *  page states amounts in US$ alone. */
export function CurrencyProvider({
  currency,
  rate,
  local = false,
  children,
}: {
  currency: Currency;
  rate: number;
  local?: boolean;
  children: ReactNode;
}) {
  return <CurrencyContext.Provider value={{ currency, rate, local }}>{children}</CurrencyContext.Provider>;
}

/** The page's currency for amounts that carry their own US$ twin (the
 *  Explore ring's budget lines): US$ on every page but the country's own
 *  language one, where the reader's choice holds. Outside a provider, US$. */
export function usePageCurrency(): Currency {
  const { currency, local } = useContext(CurrencyContext);
  return local ? currency : "usd";
}

/** Money and numbers as the contracts page states them, in the reader's
 *  locale and chosen currency. Amounts are always given in tugrik. */
export function useMoney() {
  const format = useFormatter();
  const locale = useLocale();
  const t = useTranslations("brief.contracts.money");
  const { currency, rate, local } = useContext(CurrencyContext);
  const usd = currency === "usd" && rate > 0;
  const number = (v: number) => format.number(v, { maximumFractionDigits: 1 });
  const tugrik = (value: number) => {
    const { amount, unit } = moneyParts(value);
    return t("tugrik", { unit, amount: number(amount) });
  };
  const dollars = (value: number) => {
    const { amount, unit } = moneyParts(toUsd(value, rate));
    return t("usd", { unit, amount: number(amount) });
  };
  return {
    currency: usd ? ("usd" as const) : ("mnt" as const),
    /** An amount in the chosen currency. */
    amount: (value: number) => (usd ? dollars(value) : tugrik(value)),
    /** The same amount in the other currency, for a secondary mention: only
     *  on the page in the country's own language, never tugrik elsewhere. */
    other: (value: number): string | null => (!local ? null : usd ? tugrik(value) : rate > 0 ? dollars(value) : null),
    /** The chosen currency's sign: "₮" or "US$". */
    sign: usd ? "US$" : "₮",
    /** A record-scale amount for column labels: US$ billion or ₮ trillion. */
    column: (value: number) =>
      format.number(usd ? toUsd(value, rate) / 1e9 : value / 1e12, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    /** Money of every hundred, always one decimal ("1.6", "3.0"). */
    per100: (share: number) => format.number(per100(share), { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    n: (v: number) => format.number(v),
    pct: (share: number) => {
      if (share > 0 && share < 0.005) return `<${format.number(0.01, { style: "percent", maximumFractionDigits: 0 })}`;
      return format.number(share, { style: "percent", maximumFractionDigits: 0 });
    },
    month: (ym: string) => {
      const [y, m] = ym.split("-").map(Number);
      const date = new Date(Date.UTC(y, (m || 1) - 1, 1));
      if (locale === "mn") return mongolianDate(date, { day: false });
      return format.dateTime(date, { month: "long", year: "numeric", timeZone: "UTC" });
    },
  };
}
