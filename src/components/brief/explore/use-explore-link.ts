"use client";

import { useEffect, useRef, type Dispatch } from "react";
import { exploreQuery, type ExploreAction, type ExploreState } from "@/lib/brief/explore/state";

/**
 * The explorer's part of the link. The link follows the explorer: its
 * grouping and layers always, a centre from a shared link until the reader
 * moves it, so a reload starts at rest. The function returned takes the
 * explorer to the state a shared link names, once the page has loaded.
 */
export function useExploreLink(state: ExploreState, dispatch: Dispatch<ExploreAction>) {
  const shared = useRef<string | null>(null);
  const written = useRef<string | null>(null);
  useEffect(() => {
    const key = [state.focus, state.group, state.layers.join(",")].join("|");
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
  }, [state.focus, state.group, state.layers]);

  return (linked: ExploreState) => {
    shared.current = linked.focus;
    if (linked.group !== "docs") dispatch({ type: "group", group: linked.group });
    for (const layer of linked.layers) dispatch({ type: "layer", layer, on: true });
    if (linked.focus) dispatch({ type: "focus", id: linked.focus });
  };
}
