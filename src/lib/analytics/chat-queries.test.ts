import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appendChatQuery,
  chatQueriesPath,
  CHAT_QUERY_MAX_CHARS,
  listChatQueryMonths,
  readChatQueries,
} from "./chat-queries";
import { currentMonth } from "./paths";

let dir: string;
const prevDir = process.env.CPC_LEDGER_DIR;
const prevDisabled = process.env.NEXT_PUBLIC_ANALYTICS_DISABLED;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cpc-chatq-"));
  process.env.CPC_LEDGER_DIR = dir;
  delete process.env.NEXT_PUBLIC_ANALYTICS_DISABLED;
});

afterEach(() => {
  if (prevDir === undefined) delete process.env.CPC_LEDGER_DIR;
  else process.env.CPC_LEDGER_DIR = prevDir;
  if (prevDisabled === undefined) delete process.env.NEXT_PUBLIC_ANALYTICS_DISABLED;
  else process.env.NEXT_PUBLIC_ANALYTICS_DISABLED = prevDisabled;
  rmSync(dir, { recursive: true, force: true });
});

describe("chat-query ledger", () => {
  it("appends a query and reads it back, newest first, without visitor ids", () => {
    appendChatQuery("How coherent are the NDC and NBSAP?", "mongolia", null);
    appendChatQuery("Which sector has the most tension?", "panama", null);
    const rows = readChatQueries([currentMonth()]);
    expect(rows).toHaveLength(2);
    expect(rows[0].query).toBe("Which sector has the most tension?");
    expect(rows[0].country).toBe("panama");
    const raw = readFileSync(chatQueriesPath(currentMonth()), "utf-8");
    expect(raw).not.toMatch(/clientId|sessionId/);
  });

  it("respects DNT and the kill switch, skips empty queries", () => {
    appendChatQuery("secret question", "mongolia", "1");
    appendChatQuery("   ", "mongolia", null);
    process.env.NEXT_PUBLIC_ANALYTICS_DISABLED = "1";
    appendChatQuery("also skipped", "mongolia", null);
    expect(readChatQueries([currentMonth()])).toHaveLength(0);
  });

  it("truncates oversized queries and nullifies invalid countries", () => {
    appendChatQuery("x".repeat(5000), "../etc", null);
    const rows = readChatQueries([currentMonth()]);
    expect(rows[0].query.length).toBe(CHAT_QUERY_MAX_CHARS);
    expect(rows[0].country).toBeNull();
  });

  it("skips malformed lines and missing months; guards month segment", () => {
    appendChatQuery("valid", "mongolia", null);
    writeFileSync(
      chatQueriesPath(currentMonth()),
      readFileSync(chatQueriesPath(currentMonth()), "utf-8") + "not json\n",
    );
    expect(readChatQueries(["2020-01", currentMonth()])).toHaveLength(1);
    expect(() => chatQueriesPath("../x")).toThrow(/invalid month/);
    expect(listChatQueryMonths()).toEqual([currentMonth()]);
  });
});
