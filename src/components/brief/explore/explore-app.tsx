"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import { useTranslations } from "next-intl";
import { scopeOf } from "@/lib/brief/compute";
import { buildBriefData } from "@/lib/brief/data";
import type { ExploreLayers } from "@/lib/brief/explore/layers";
import { exploreQuery, exploreReducer, type ExploreGroup, type ExploreState } from "@/lib/brief/explore/state";
import type { BriefSource, LensId } from "@/lib/brief/source";
import { Explore } from "./explore";
import "../brief.css";

/**
 * The explorer on a page of its own, while it is being built: the same
 * component the brief will take in, fed by the brief's source and its
 * document selection. The link keeps the target in the centre and the
 * grouping, next to the brief's own parameters.
 */
export function ExploreApp({
  source,
  docs,
  lens,
  groups,
  initialState,
  layers = null,
  initialPair = null,
}: {
  source: BriefSource;
  docs: string[];
  lens: LensId | null;
  groups: ExploreGroup[];
  initialState: ExploreState;
  layers?: ExploreLayers | null;
  initialPair?: { a: string; b: string } | null;
}) {
  const t = useTranslations("brief.explore");
  const [state, dispatch] = useReducer(exploreReducer, initialState);
  const scope = useMemo(() => scopeOf(source, docs), [source, docs]);
  const data = useMemo(() => buildBriefData(source, scope, lens), [source, scope, lens]);

  // The link carries the grouping. A target in the centre is read from a
  // shared link once, but not written back, so a reload starts at rest.
  const opened = useRef(state.focus);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("group");
    params.delete("layers");
    if (state.focus !== opened.current) {
      params.delete("focus");
      params.delete("pair");
    }
    for (const [key, value] of new URLSearchParams(exploreQuery({ ...state, focus: null }))) params.set(key, value);
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
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
          groups={groups}
          layers={layers}
          initialPair={initialPair}
        />
      </div>
    </div>
  );
}
