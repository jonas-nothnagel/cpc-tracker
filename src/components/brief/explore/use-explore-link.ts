"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { LinkParams } from "@/lib/brief/link";
import { exploreFromLink, type ExploreSetup } from "@/lib/brief/explore/setup";
import { exploreQuery, exploreReducer, initialExploreState } from "@/lib/brief/explore/state";
import type { BriefSource } from "@/lib/brief/source";

/**
 * The explorer's state and its part of the link. The link follows the
 * explorer's grouping and layers. A centre and comparison a shared link names
 * stay in it until the reader moves the centre; a centre the reader picks is
 * never written, so after that a reload starts at rest. `follow` takes the
 * explorer to what a shared link names, once the page has loaded; `pair` is
 * the comparison it opens beside the centre.
 */
export function useExploreLink(source: BriefSource, setup: ExploreSetup | undefined) {
  const [state, dispatch] = useReducer(exploreReducer, undefined, initialExploreState);
  const [pair, setPair] = useState<{ a: string; b: string } | null>(null);
  const shared = useRef<string | null>(null);
  const written = useRef<string | null>(null);
  // What the link would carry for this state.
  const key = exploreQuery(state);
  useEffect(() => {
    // The link stays as it came until the explorer first moves: the page
    // reads it once it has loaded, after this first look.
    if (written.current === null || written.current === key) {
      written.current = key;
      return;
    }
    written.current = key;
    const params = new URLSearchParams(window.location.search);
    params.delete("group");
    params.delete("layers");
    if (state.focus !== shared.current) {
      params.delete("focus");
      params.delete("pair");
    }
    for (const [name, value] of new URLSearchParams(exploreQuery({ ...state, focus: null }))) params.set(name, value);
    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
    // Only what the link carries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const follow = (params: LinkParams, docs: string[]) => {
    if (!setup) return;
    const linked = exploreFromLink({ params, source, docs, setup });
    shared.current = linked.state.focus;
    if (linked.state.group !== "docs") dispatch({ type: "group", group: linked.state.group });
    for (const layer of linked.state.layers) dispatch({ type: "layer", layer, on: true });
    if (linked.state.focus) dispatch({ type: "focus", id: linked.state.focus });
    setPair(linked.pair);
  };
  return { state, dispatch, follow, pair };
}
