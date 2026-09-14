import { describe, expect, it } from "vitest";
import { resolveRailMode, type RailSignals } from "./rail-mode";

const idle: RailSignals = {
  hasSelection: false,
  hasReply: false,
  hasError: false,
  loading: false,
  hasInsight: false,
  dismissed: false,
};

describe("resolveRailMode", () => {
  it("shows the summary when nothing is selected or asked", () => {
    expect(resolveRailMode(idle)).toBe("summary");
  });

  it("switches to the answer the moment a question is in flight", () => {
    expect(resolveRailMode({ ...idle, loading: true })).toBe("answer");
  });

  it("shows the answer once a reply or an error exists", () => {
    expect(resolveRailMode({ ...idle, hasReply: true })).toBe("answer");
    expect(resolveRailMode({ ...idle, hasError: true })).toBe("answer");
  });

  it("returns to the summary when the answer was dismissed", () => {
    expect(resolveRailMode({ ...idle, hasReply: true, dismissed: true })).toBe("summary");
    expect(resolveRailMode({ ...idle, loading: true, dismissed: true })).toBe("summary");
  });

  it("lets a selected target or group win over an answer", () => {
    expect(resolveRailMode({ ...idle, hasSelection: true })).toBe("detail");
    expect(resolveRailMode({ ...idle, hasSelection: true, hasReply: true })).toBe("detail");
    expect(resolveRailMode({ ...idle, hasSelection: true, loading: true })).toBe("detail");
  });

  it("shows a surfaced insight as an answer until it is dismissed", () => {
    expect(resolveRailMode({ ...idle, hasInsight: true })).toBe("answer");
    expect(resolveRailMode({ ...idle, hasInsight: true, dismissed: true })).toBe("summary");
    expect(resolveRailMode({ ...idle, hasInsight: true, hasSelection: true })).toBe("detail");
  });

  it("keeps the detail even after an answer was dismissed", () => {
    expect(resolveRailMode({ ...idle, hasSelection: true, dismissed: true })).toBe("detail");
  });
});
