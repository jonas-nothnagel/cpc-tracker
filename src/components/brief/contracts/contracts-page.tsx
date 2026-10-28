"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { firstParam, linkParams } from "@/lib/brief/link";
import { emptyFocus, type Focus } from "@/lib/brief/contracts/focus";
import type { GeoFile } from "@/lib/brief/contracts/geo";
import type { LensKey } from "@/lib/brief/contracts/model";
import type { ContractsSetup } from "@/lib/brief/contracts/setup";
import { CloserBlock } from "./closer-block";
import { CurrencySwitch, useLinkCurrency } from "./currency-switch";
import { FocusBar } from "./focus-bar";
import { CurrencyProvider } from "./money";
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
  localCurrency = false,
}: {
  setup: ContractsSetup;
  geo: GeoFile | null;
  /** The page is in the country's own language: tugrik by default, with a
   *  switch to US$. Elsewhere amounts are in US$ alone. */
  localCurrency?: boolean;
}) {
  const t = useTranslations("brief.contracts");
  // One focus for the whole page: every view answers it. A new lens lets the
  // policy area go (its categories are the old lens's).
  const [focus, setFocus] = useState<Focus>(() => emptyFocus((setup.lenses[0]?.id as LensKey) ?? "globe"));
  const onFocus = (patch: Partial<Focus>) =>
    setFocus((cur) => ({ ...cur, ...patch, ...(patch.lens && patch.lens !== cur.lens ? { area: null } : {}) }));
  const [stack, setStack] = useState<PanelState[]>([]);
  const [currency, setCurrency] = useLinkCurrency(localCurrency);
  const rate = setup.file.source.usdRate;

  // The page is built once for every reader, when the site is deployed: a
  // shared link's contract (?contract=id, e.g. from the brief's comparison)
  // opens once it has loaded, only where the page lists it (the currency's
  // link is read in useLinkCurrency).
  useEffect(() => {
    const contract = firstParam(linkParams(window.location.search).contract);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (contract && setup.file.contracts.some((c) => c.id === contract)) setStack([{ kind: "contract", id: contract }]);
    // Once, as the page loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const open = (p: PanelState) => setStack([p]);
  const placeNames = useMemo(() => Object.fromEntries((geo?.features ?? []).map((f) => [f.code, f.name])), [geo]);

  return (
    <CurrencyProvider currency={currency} rate={rate} local={localCurrency}>
      <div data-brief className="brief-root">
        <div className="ct-page">
          <header className="ct-head">
            <p className="ct-country">{setup.countryName}</p>
            <h1 className="ct-title">{t("title")}</h1>
            {localCurrency && <CurrencySwitch currency={currency} rate={rate} onChange={setCurrency} />}
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
