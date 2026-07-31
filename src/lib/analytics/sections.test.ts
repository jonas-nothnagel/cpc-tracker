import { describe, expect, it } from "vitest";

import { ROUTE_PATTERNS } from "./route-pattern";
import {
  DRAWER_KIND_SECTION,
  ROUTE_NAMES,
  SECTION_IDS,
  SECTION_REGISTRY,
  TRACK_EVENT_NAMES,
} from "./sections";

/**
 * The registry duplicates the dashboard's section ids on purpose (importing
 * them would couple the analytics lib to the dashboard module graph). This
 * hardcoded expectation mirrors SECTION_ORDER in
 * src/components/dashboard/coherence-briefing/index.tsx — update BOTH when
 * a section is added, removed, or reordered.
 */
const DASHBOARD_SECTION_ORDER = [
  "direction",
  "doc-focus",
  "doc-pairs",
  "friction-types",
  "where-to-focus",
  "sectors",
  "financing",
  "implementation",
  "explore",
];

describe("SECTION_REGISTRY", () => {
  it("matches the dashboard's section order exactly", () => {
    expect(SECTION_REGISTRY.map((s) => s.id)).toEqual(DASHBOARD_SECTION_ORDER);
  });

  it("has unique ids and contiguous 1-based orders", () => {
    expect(SECTION_IDS.size).toBe(SECTION_REGISTRY.length);
    expect(SECTION_REGISTRY.map((s) => s.order)).toEqual(
      SECTION_REGISTRY.map((_, i) => i + 1),
    );
  });

  it("gives every section a name and blurb", () => {
    for (const s of SECTION_REGISTRY) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(0);
    }
  });
});

describe("display-name maps", () => {
  it("maps every drawer kind to a real section", () => {
    for (const section of Object.values(DRAWER_KIND_SECTION)) {
      expect(SECTION_IDS.has(section)).toBe(true);
    }
    // target-pair drawers open from many sections; never attribute them.
    expect(DRAWER_KIND_SECTION["target-pair"]).toBeUndefined();
  });

  it("names every route pattern", () => {
    for (const route of ROUTE_PATTERNS) {
      expect(ROUTE_NAMES[route], `missing name for ${route}`).toBeTruthy();
    }
  });

  it("names every emitted track event", () => {
    for (const name of [
      "drawer_opened",
      "panel_drilled",
      "chat_message_sent",
      "analysis_run_started",
      "upload_step",
      "model_switched",
      "section_viewed",
    ]) {
      expect(TRACK_EVENT_NAMES[name], `missing name for ${name}`).toBeTruthy();
    }
  });
});
