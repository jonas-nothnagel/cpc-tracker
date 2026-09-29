"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { moneyParts, per100, toUsd } from "@/lib/brief/contracts/money";

/** The currency the page states amounts in: the record's own (tugrik) or
 *  US$ at the record's indicative rate. */
export type Currency = "mnt" | "usd";

const CurrencyContext = createContext<{ currency: Currency; rate: number }>({ currency: "mnt", rate: 0 });

export function CurrencyProvider({ currency, rate, children }: { currency: Currency; rate: number; children: ReactNode }) {
  return <CurrencyContext.Provider value={{ currency, rate }}>{children}</CurrencyContext.Provider>;
}

/** Money and numbers as the contracts page states them, in the reader's
 *  locale and chosen currency. Amounts are always given in tugrik. */
export function useMoney() {
  const format = useFormatter();
  const t = useTranslations("brief.contracts.money");
  const { currency, rate } = useContext(CurrencyContext);
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
    /** The same amount in the other currency, for a secondary mention. */
    other: (value: number) => (usd ? tugrik(value) : rate > 0 ? dollars(value) : tugrik(value)),
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
      return format.dateTime(new Date(Date.UTC(y, (m || 1) - 1, 1)), { month: "long", year: "numeric", timeZone: "UTC" });
    },
  };
}
