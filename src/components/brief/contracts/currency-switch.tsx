"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { Currency } from "./money";

/**
 * Amounts in tugrik or US$, as plain text choices, with the indicative rate
 * beside US$. The choice travels with the link (`?cur=usd`), so a shared page
 * opens as it was read. Nothing where the record carries no rate.
 */
export function CurrencySwitch({
  currency,
  rate,
  onChange,
}: {
  currency: Currency;
  rate: number;
  onChange: (next: Currency) => void;
}) {
  const tc = useTranslations("brief.contracts.currency");
  const format = useFormatter();
  if (rate <= 0) return null;
  const choose = (next: Currency) => {
    onChange(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "usd") params.set("cur", "usd");
    else params.delete("cur");
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  };
  return (
    <div className="ct-currency" role="group" aria-label={tc("label")}>
      <span className="ct-currency-label">{tc("label")}</span>
      {(["mnt", "usd"] as const).map((c) => (
        <button key={c} type="button" className="ct-lens-option" aria-pressed={currency === c} onClick={() => choose(c)}>
          {tc(c)}
        </button>
      ))}
      {currency === "usd" && <span className="ct-currency-rate">{tc("rate", { rate: format.number(rate) })}</span>}
    </div>
  );
}
