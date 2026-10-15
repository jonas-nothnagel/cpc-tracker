"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import { useTranslations } from "next-intl";
import { scopeOf } from "@/lib/brief/compute";
import { buildBriefData } from "@/lib/brief/data";
import type { ExploreSetup } from "@/lib/brief/explore/setup";
import { exploreQuery, exploreReducer } from "@/lib/brief/explore/state";
import type { BriefSource, LensId } from "@/lib/brief/source";
import { Explore } from "./explore";
import "../brief.css";

/**
 * The explorer on a page of its own, to share before the brief around it:
 * the same component the brief ends with, fed by the brief's source and its
 * document selection. The link carries the grouping and the layers; a
 * centre is read from a shared link once, but not written back, so a
 * reload starts at rest.
 */
export function ExplorePage({
  source,
  docs,
  lens,
  setup,
}: {
  source: BriefSource;
  docs: string[];
  lens: LensId | null;
  setup: ExploreSetup;
}) {
  const t = useTranslations("brief.explore");
  const [state, dispatch] = useReducer(exploreReducer, setup.initialState);
  const scope = useMemo(() => scopeOf(source, docs), [source, docs]);
  const data = useMemo(() => buildBriefData(source, scope, lens), [source, scope, lens]);

  const sharedFocus = useRef(state.focus);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("group");
    params.delete("layers");
    if (state.focus !== sharedFocus.current) {
      params.delete("focus");
      params.delete("pair");
    }
    for (const [key, value] of new URLSearchParams(exploreQuery({ ...state, focus: null }))) params.set(key, value);
    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
    // Only what the link carries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.focus, state.group, state.layers]);

  return (
    <div data-brief className="brief-root">
      <div className="ex-page">
        <header className="ex-page-head">
          <p className="ex-page-country">{source.countryName}</p>
          <h1 className="ex-page-title">{t("title")}</h1>
        </header>
        <Explore
          source={source}
          data={data}
          state={state}
          dispatch={dispatch}
          groups={setup.groups}
          layers={setup.layers}
          initialPair={setup.initialPair}
        />
      </div>
    </div>
  );
}
