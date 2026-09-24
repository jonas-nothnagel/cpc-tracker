import type { LensId } from "../source";

/**
 * The explorer's state, changed only through actions: the controls, the
 * ring, the keyboard, the link and (later) the chat all dispatch the same
 * ones, so any of them can drive the view.
 */

export type ExploreGroup = "docs" | LensId;

export interface ExploreState {
  /** The target in the centre, or null for the resting ring. */
  focus: string | null;
  /** Targets that were in the centre before, most recent last. */
  trail: string[];
  group: ExploreGroup;
  /** Search text; not part of the link. */
  query: string;
}

export type ExploreAction =
  | { type: "focus"; id: string }
  | { type: "back" }
  | { type: "clear" }
  | { type: "group"; group: ExploreGroup }
  | { type: "query"; text: string };

/** Most steps Back can take. */
const TRAIL = 12;

export function initialExploreState(): ExploreState {
  return { focus: null, trail: [], group: "docs", query: "" };
}

export function exploreReducer(state: ExploreState, action: ExploreAction): ExploreState {
  switch (action.type) {
    case "focus": {
      if (state.focus === action.id) return state;
      const trail = state.focus ? [...state.trail, state.focus].slice(-TRAIL) : state.trail;
      return { ...state, focus: action.id, trail, query: "" };
    }
    case "back": {
      const trail = state.trail.slice(0, -1);
      return { ...state, focus: state.trail[state.trail.length - 1] ?? null, trail };
    }
    case "clear":
      return { ...state, focus: null, trail: [] };
    case "group":
      return state.group === action.group ? state : { ...state, group: action.group };
    case "query":
      return { ...state, query: action.text };
    default:
      return state;
  }
}

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Read the state from a link; anything unknown falls back to the resting ring. */
export function parseExploreState(params: Params, ids: Set<string>, groups: ExploreGroup[]): ExploreState {
  const state = initialExploreState();
  const focus = first(params.focus);
  const group = first(params.group) as ExploreGroup | undefined;
  return {
    ...state,
    focus: focus && ids.has(focus) ? focus : null,
    group: group && groups.includes(group) ? group : state.group,
  };
}

/** Query string for a shareable link; only what differs from the resting ring. */
export function exploreQuery(state: ExploreState): string {
  const params = new URLSearchParams();
  if (state.focus) params.set("focus", state.focus);
  if (state.group !== "docs") params.set("group", state.group);
  return params.toString();
}
