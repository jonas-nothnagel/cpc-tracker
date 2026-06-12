import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { feedbackPath } from "./paths";
import {
  appendFeedbackEvent,
  foldFeedback,
  readFeedbackEvents,
} from "./store";
import type { FeedbackEvent } from "./types";

const CLIENT_A = "123e4567-e89b-42d3-a456-426614174000";
const CLIENT_B = "223e4567-e89b-42d3-a456-426614174000";

function event(
  overrides: Partial<FeedbackEvent> = {},
): Omit<FeedbackEvent, "schema" | "ts"> {
  return {
    country: "mongolia",
    surface: "target_pair_rationale",
    anchorKey: "NBSAP-T4__NDC-T1",
    anchorIds: ["NDC-T1", "NBSAP-T4"],
    vote: "up",
    comment: null,
    clientId: CLIENT_A,
    locale: "en",
    contentHash: "a".repeat(64),
    contentSnapshot: "snapshot",
    context: {},
    ...overrides,
  };
}

let dir: string;
const prev = process.env.CPC_LEDGER_DIR;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cpc-feedback-"));
  process.env.CPC_LEDGER_DIR = dir;
});

afterEach(() => {
  if (prev === undefined) delete process.env.CPC_LEDGER_DIR;
  else process.env.CPC_LEDGER_DIR = prev;
  rmSync(dir, { recursive: true, force: true });
});

describe("feedbackPath", () => {
  it("honours CPC_LEDGER_DIR and the per-country layout", () => {
    expect(feedbackPath("mongolia")).toBe(
      join(dir, "feedback", "mongolia.jsonl"),
    );
  });

  it("rejects non-canonical slugs before any path is built", () => {
    for (const bad of ["../mongolia", "Mongolia", "a/b", "", "x".repeat(33)]) {
      expect(() => feedbackPath(bad)).toThrow();
    }
  });
});

describe("appendFeedbackEvent / readFeedbackEvents", () => {
  it("appends with stamped schema + UTC ts and reads back", () => {
    const res = appendFeedbackEvent(event());
    expect(res.ok).toBe(true);
    const events = readFeedbackEvents("mongolia");
    expect(events).toHaveLength(1);
    expect(events[0].schema).toBe(1);
    expect(events[0].vote).toBe("up");
    expect(events[0].ts).toMatch(/T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("appends events as new lines, never overwriting", () => {
    appendFeedbackEvent(event());
    appendFeedbackEvent(event({ vote: "retracted" }));
    const raw = readFileSync(feedbackPath("mongolia"), "utf-8");
    expect(raw.trimEnd().split("\n")).toHaveLength(2);
  });

  it("keeps countries in separate files", () => {
    appendFeedbackEvent(event());
    appendFeedbackEvent(event({ country: "panama" }));
    expect(readFeedbackEvents("mongolia")).toHaveLength(1);
    expect(readFeedbackEvents("panama")).toHaveLength(1);
  });

  it("skips malformed lines without throwing", () => {
    appendFeedbackEvent(event());
    writeFileSync(
      feedbackPath("mongolia"),
      readFileSync(feedbackPath("mongolia"), "utf-8") + "not json\n",
    );
    appendFeedbackEvent(event({ vote: "down" }));
    expect(readFeedbackEvents("mongolia")).toHaveLength(2);
  });

  it("returns [] when the file does not exist", () => {
    expect(readFeedbackEvents("mongolia")).toEqual([]);
  });

  it("reports failure instead of throwing on an unwritable directory", () => {
    if (typeof process.getuid === "function" && process.getuid() === 0) {
      return; // chmod is ineffective as root
    }
    const readonly = join(dir, "feedback");
    mkdirSync(readonly, { recursive: true });
    chmodSync(readonly, 0o500);
    try {
      const res = appendFeedbackEvent(event());
      expect(res.ok).toBe(false);
    } finally {
      chmodSync(readonly, 0o700);
    }
  });
});

describe("foldFeedback", () => {
  it("keeps the last event per client + surface + anchor", () => {
    const folded = foldFeedback([
      { ...event(), schema: 1, ts: "t1" },
      { ...event({ vote: "down", comment: "off" }), schema: 1, ts: "t2" },
    ]);
    expect(folded.size).toBe(1);
    const winner = [...folded.values()][0];
    expect(winner.vote).toBe("down");
    expect(winner.comment).toBe("off");
  });

  it("treats a retracted winner as carrying no active vote", () => {
    const folded = foldFeedback([
      { ...event(), schema: 1, ts: "t1" },
      { ...event({ vote: "retracted" }), schema: 1, ts: "t2" },
    ]);
    expect([...folded.values()][0].vote).toBe("retracted");
  });

  it("keeps different clients independent on the same anchor", () => {
    const folded = foldFeedback([
      { ...event(), schema: 1, ts: "t1" },
      { ...event({ clientId: CLIENT_B, vote: "down" }), schema: 1, ts: "t2" },
    ]);
    expect(folded.size).toBe(2);
  });

  it("keeps surfaces independent on the same anchor ids", () => {
    const folded = foldFeedback([
      { ...event(), schema: 1, ts: "t1" },
      {
        ...event({ surface: "doc_pair_synthesis" }),
        schema: 1,
        ts: "t2",
      },
    ]);
    expect(folded.size).toBe(2);
  });
});
