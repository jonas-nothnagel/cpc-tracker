"use client";

import { useFormatter, useTranslations } from "next-intl";
import { moneyParts, per100, toUsd } from "@/lib/brief/contracts/money";

/** Money and numbers as the contracts page states them, in the reader's locale. */
export function useMoney() {
  const format = useFormatter();
  const t = useTranslations("brief.contracts.money");
  const amount = (v: number) => format.number(v, { maximumFractionDigits: 1 });
  return {
    tugrik: (value: number) => {
      const { amount: a, unit } = moneyParts(value);
      return t("tugrik", { unit, amount: amount(a) });
    },
    usd: (value: number, rate: number) => {
      const { amount: a, unit } = moneyParts(toUsd(value, rate));
      return t("usd", { unit, amount: amount(a) });
    },
    /** Tugrik of every hundred, always one decimal ("1.6", "3.0"). */
    per100: (share: number) =>
      format.number(per100(share), {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    n: (v: number) => format.number(v),
    pct: (share: number) => {
      if (share > 0 && share < 0.005) return `<${format.number(0.01, { style: "percent", maximumFractionDigits: 0 })}`;
      return format.number(share, {
        style: "percent",
        maximumFractionDigits: 0,
      });
    },
    month: (ym: string) => {
      const [y, m] = ym.split("-").map(Number);
      return format.dateTime(new Date(Date.UTC(y, (m || 1) - 1, 1)), {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    },
  };
}
