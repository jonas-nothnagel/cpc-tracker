"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { scopeOf } from "@/lib/brief/compute";
import { buildBriefData } from "@/lib/brief/data";
import { linkParams } from "@/lib/brief/link";
import { defaultSelection, keepUnchanged, parseSelection } from "@/lib/brief/selection";
import type { ExploreSetup } from "@/lib/brief/explore/setup";
import type { BriefSource } from "@/lib/brief/source";
import { useLinkCurrency } from "../contracts/currency-switch";
import { CurrencyProvider } from "../contracts/money";
import { Explore } from "./explore";
import { useExploreLink } from "./use-explore-link";
import "../brief.css";

/**
 * The explorer on a page of its own, to share before the brief around it:
 * the same component the brief ends with, fed by the brief's source and its
 * document selection. The link carries the documents, the policy area, the
 * grouping and the layers. A centre and comparison a shared link names stay
 * in it until the reader moves the centre; a centre the reader picks is never
 * written, so after that a reload starts at rest.
 */
export function ExplorePage({
  source,
  setup,
  localCurrency = false,
  rate = 0,
}: {
  source: BriefSource;
  setup: ExploreSetup;
  /** The page is in the country's own language: amounts in its currency,
   *  unless a shared link names US$ (?cur=usd). */
  localCurrency?: boolean;
  /** US$ per unit of the country's currency, for the contracts under a
   *  comparison. */
  rate?: number;
}) {
  const t = useTranslations("brief.explore");
  const [selection, setSelection] = useState(() => defaultSelection(source));
  const [currency] = useLinkCurrency(localCurrency);
  const { state, dispatch, follow, pair: linkedPair } = useExploreLink(source, setup);
  const scope = useMemo(() => scopeOf(source, selection.docs), [source, selection.docs]);
  const data = useMemo(() => buildBriefData(source, scope, selection.lens), [source, scope, selection.lens]);

  // The page is built once for every reader, when the site is deployed: the
  // choices a shared link carries apply once it has loaded (the currency's
  // in useLinkCurrency).
  useEffect(() => {
    const params = linkParams(window.location.search);
    const linked = parseSelection(params, source);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.docs || params.lens) setSelection((cur) => keepUnchanged(cur, linked));
    follow(params, linked.docs);
    // Once, as the page loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CurrencyProvider currency={currency} rate={rate} local={localCurrency}>
      <div data-brief className="brief-root">
        <div className="ex-page">
          <header className="ex-page-head">
            <p className="ex-page-country">{source.countryName}</p>
            <h1 className="ex-page-title">{t("title")}</h1>
          </header>
          <Explore
            key={linkedPair ? `${linkedPair.a}~${linkedPair.b}` : undefined}
            source={source}
            data={data}
            state={state}
            dispatch={dispatch}
            groups={setup.groups}
            layers={setup.layers}
            initialPair={linkedPair}
          />
        </div>
      </div>
    </CurrencyProvider>
  );
}
