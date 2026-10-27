import { describe, expect, it } from "vitest";
import { serviceFacts } from "./service";

describe("serviceFacts", () => {
  it("names the model and the provider the documents go to", () => {
    expect(
      serviceFacts({ LLM_MODEL: "gpt-5.4", AZURE_OPENAI_ENDPOINT: "https://cpc-tracker-ai-c657.openai.azure.com/" }),
    ).toMatchObject({ model: "gpt-5.4", provider: "Azure OpenAI" });
    expect(serviceFacts({ LLM_MODEL: "openai/gpt-4o-mini", LLM_BASE_URL: "https://openrouter.ai/api/v1" })).toMatchObject({
      model: "gpt-4o-mini",
      provider: "OpenRouter",
    });
    expect(serviceFacts({ LLM_MODEL: "llama-3.3", LLM_BASE_URL: "https://llm.gov.example/v1" })).toMatchObject({
      provider: "llm.gov.example",
    });
  });

  it("asks for public documents only on a production service, unless turned off", () => {
    expect(serviceFacts({ NODE_ENV: "production" }).publicOnly).toBe(true);
    expect(serviceFacts({ NODE_ENV: "production", CPC_PUBLIC_DOCUMENTS_ONLY: "0" }).publicOnly).toBe(false);
    expect(serviceFacts({ NODE_ENV: "development" }).publicOnly).toBe(false);
    expect(serviceFacts({ NODE_ENV: "development", CPC_PUBLIC_DOCUMENTS_ONLY: "1" }).publicOnly).toBe(true);
  });
});

describe("the service's own measurements", () => {
  it("reads the pace of its completed runs, newest first, leaving resumed ones out", async () => {
    const { mkdirSync, mkdtempSync, writeFileSync } = await import("fs");
    const { tmpdir } = await import("os");
    const { join } = await import("path");
    const { vi } = await import("vitest");
    const root = mkdtempSync(join(tmpdir(), "cpc-speed-"));
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const run = (id: string, status: Record<string, unknown>) => {
      mkdirSync(join(root, "python", "analyses", id, "output"), { recursive: true });
      writeFileSync(join(root, "python", "analyses", id, "output", "status.json"), JSON.stringify(status));
    };
    run("a", { status: "completed", completedAt: "2026-10-20T10:00:00Z", summary: { totalPairs: 2000, elapsedSeconds: 300 } });
    run("b", { status: "completed", completedAt: "2026-10-21T10:00:00Z", summary: { totalPairs: 6000, elapsedSeconds: 720 } });
    run("c", { status: "completed", completedAt: "2026-10-22T10:00:00Z", summary: { totalPairs: 900, elapsedSeconds: 30, resumed: true } });
    run("d", { status: "running" });
    mkdirSync(join(root, "python", "output"), { recursive: true });
    const row = (component: string, co2: number, calls: number, cached = 0) =>
      JSON.stringify({ component, co2_geq: co2, call_count: calls, cached_call_count: cached });
    writeFileSync(
      join(root, "python", "output", "footprint-ledger.jsonl"),
      [row("user_pipeline", 8, 100), row("dev_pipeline", 2, 60, 10), row("chat", 50, 1)].join("\n") + "\n",
    );
    const { gramsPerCall, runHistory } = await import("./service");
    expect(runHistory()).toEqual([
      { pairs: 6000, seconds: 720 },
      { pairs: 2000, seconds: 300 },
    ]);
    expect(gramsPerCall()).toBeCloseTo(10 / 150);
    vi.restoreAllMocks();
  });
});
