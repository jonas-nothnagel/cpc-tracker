import { describe, expect, it } from "vitest";
import {
  exploreQuery,
  exploreReducer,
  initialExploreState,
  parseExploreState,
  type ExploreState,
} from "./state";

const IDS = new Set(["A1", "A2", "B1"]);
const GROUPS = ["docs", "globe"] as const;

describe("parseExploreState", () => {
  it("reads the target in the centre and the grouping from the link", () => {
    const state = parseExploreState({ focus: "A2", group: "globe" }, IDS, [...GROUPS]);
    expect(state.focus).toBe("A2");
    expect(state.group).toBe("globe");
  });

  it("falls back to the resting ring for anything it does not know", () => {
    const state = parseExploreState({ focus: "Z9", group: "unknown" }, IDS, [...GROUPS]);
    expect(state).toEqual(initialExploreState());
  });
});

describe("exploreQuery", () => {
  it("writes only what differs from the resting ring", () => {
    expect(exploreQuery(initialExploreState())).toBe("");
    const state: ExploreState = { ...initialExploreState(), focus: "A1", group: "globe" };
    expect(exploreQuery(state)).toBe("focus=A1&group=globe");
  });
});

describe("exploreReducer", () => {
  const rest = initialExploreState();

  it("puts a target in the centre and remembers the one before", () => {
    const one = exploreReducer(rest, { type: "focus", id: "A1" });
    const two = exploreReducer(one, { type: "focus", id: "B1" });
    expect(two.focus).toBe("B1");
    expect(two.trail).toEqual(["A1"]);
  });

  it("does nothing when the target is already in the centre", () => {
    const one = exploreReducer(rest, { type: "focus", id: "A1" });
    expect(exploreReducer(one, { type: "focus", id: "A1" })).toBe(one);
  });

  it("steps back to the previous target, then to the resting ring", () => {
    let s = exploreReducer(rest, { type: "focus", id: "A1" });
    s = exploreReducer(s, { type: "focus", id: "B1" });
    s = exploreReducer(s, { type: "back" });
    expect(s.focus).toBe("A1");
    expect(s.trail).toEqual([]);
    s = exploreReducer(s, { type: "back" });
    expect(s.focus).toBeNull();
  });

  it("clears the centre and the trail", () => {
    let s = exploreReducer(rest, { type: "focus", id: "A1" });
    s = exploreReducer(s, { type: "focus", id: "B1" });
    s = exploreReducer(s, { type: "clear" });
    expect(s.focus).toBeNull();
    expect(s.trail).toEqual([]);
  });

  it("keeps the target in the centre when the grouping changes", () => {
    const s = exploreReducer(exploreReducer(rest, { type: "focus", id: "A1" }), { type: "group", group: "globe" });
    expect(s.focus).toBe("A1");
    expect(s.group).toBe("globe");
  });

  it("clears the search when a target goes to the centre", () => {
    const searching = exploreReducer(rest, { type: "query", text: "water" });
    expect(searching.query).toBe("water");
    expect(exploreReducer(searching, { type: "focus", id: "A1" }).query).toBe("");
  });

  it("keeps the trail short", () => {
    let s = rest;
    for (let i = 0; i < 30; i++) s = exploreReducer(s, { type: "focus", id: `T${i}` });
    expect(s.trail.length).toBeLessThanOrEqual(12);
    expect(s.trail[s.trail.length - 1]).toBe("T28");
  });
});
