"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { emptyFocus, type Focus } from "@/lib/brief/contracts/focus";
import type { GeoFile } from "@/lib/brief/contracts/geo";
import type { LensKey } from "@/lib/brief/contracts/model";
import type { ContractsSetup } from "@/lib/brief/contracts/setup";
import { CloserBlock } from "./closer-block";
import { FocusBar } from "./focus-bar";
import { CurrencyProvider, type Currency } from "./money";
import { Overview } from "./overview";
import { ContractsPanels } from "./panels";
import "../brief.css";
import "./contracts.css";

/** A contract or a target opened in the panel, as a trail. */
export type PanelState =
  | { kind: "contract"; id: string }
  | { kind: "target"; id: string }
  | { kind: "list"; title: string; ids: string[] };

/**
 * Public contracts beside the targets, on a page of its own: the overview
 * (the record narrowing to nature and climate, toward the policy areas and
 * places), then the deep dives, with a contract or a target in a panel.
 */
export function ContractsPage({
  setup,
  geo,
  initialCurrency = "mnt",
}: {
  setup: ContractsSetup;
  geo: GeoFile | null;
  /** From the link (?cur=usd): the currency the page opens in. */
  initialCurrency?: Currency;
}) {
  const t = useTranslations("brief.contracts");
  // One focus for the whole page: every view answers it. A new lens lets the
  // policy area go (its categories are the old lens's).
  const [focus, setFocus] = useState<Focus>(() => emptyFocus((setup.lenses[0]?.id as LensKey) ?? "globe"));
  const onFocus = (patch: Partial<Focus>) =>
    setFocus((cur) => ({ ...cur, ...patch, ...(patch.lens && patch.lens !== cur.lens ? { area: null } : {}) }));
  const [stack, setStack] = useState<PanelState[]>([]);
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const rate = setup.file.source.usdRate;
  const format = useFormatter();
  const tc = useTranslations("brief.contracts.currency");
  // The choice travels with the link, so a shared page opens as it was read.
  const choose = (next: Currency) => {
    setCurrency(next);
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
  const open = (p: PanelState) => setStack([p]);
  const placeNames = useMemo(() => Object.fromEntries((geo?.features ?? []).map((f) => [f.code, f.name])), [geo]);

  return (
    <CurrencyProvider currency={currency} rate={rate}>
      <div data-brief className="brief-root">
        <div className="ct-page">
          <header className="ct-head">
            <p className="ct-country">{setup.countryName}</p>
            <h1 className="ct-title">{t("title")}</h1>
            {rate > 0 && (
              <div className="ct-currency" role="group" aria-label={tc("label")}>
                <span className="ct-currency-label">{tc("label")}</span>
                {(["mnt", "usd"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="ct-lens-option"
                    aria-pressed={currency === c}
                    onClick={() => choose(c)}
                  >
                    {tc(c)}
                  </button>
                ))}
                {currency === "usd" && (
                  <span className="ct-currency-rate">{tc("rate", { rate: format.number(rate) })}</span>
                )}
              </div>
            )}
          </header>
          <FocusBar setup={setup} focus={focus} placeNames={placeNames} onFocus={onFocus} />
          <Overview
            setup={setup}
            geo={geo}
            focus={focus}
            onFocus={onFocus}
            onContract={(id) => open({ kind: "contract", id })}
            onTarget={(id) => open({ kind: "target", id })}
            onList={(list) => open({ kind: "list", ...list })}
          />
          <div className="ct-deeps">
            <CloserBlock setup={setup} focus={focus} placeNames={placeNames} onContract={(id) => open({ kind: "contract", id })} />
          </div>
        </div>
        <ContractsPanels
          stack={stack}
          setup={setup}
          placeNames={placeNames}
          onPush={(next) => setStack((s) => [...s, next])}
          onBack={() => setStack((s) => s.slice(0, -1))}
          onClose={() => setStack([])}
        />
      </div>
    </CurrencyProvider>
  );
}
