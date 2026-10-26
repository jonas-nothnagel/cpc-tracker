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
