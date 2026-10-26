/**
 * What this deployment tells the upload page about itself, from its own
 * settings: which model reads the documents, on which provider, and whether
 * only public documents may be added (UNDP's hosted service). A government
 * running its own copy with its own model sees its own names. Server-only.
 */

export interface ServiceFacts {
  model: string;
  provider: string;
  /** "Only public documents can be added." */
  publicOnly: boolean;
}

type Env = Record<string, string | undefined>;

function host(url: string | undefined): string | null {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}

export function serviceFacts(env: Env = process.env): ServiceFacts {
  const model = (env.LLM_MODEL || "openai/gpt-4o-mini").split("/").pop() || "the configured model";
  const base = host(env.LLM_BASE_URL);
  let provider: string;
  if (env.AZURE_OPENAI_ENDPOINT || base?.endsWith("openai.azure.com")) provider = "Azure OpenAI";
  else if (!base || base === "openrouter.ai" || base.endsWith(".openrouter.ai")) provider = "OpenRouter";
  else provider = base;
  const flag = env.CPC_PUBLIC_DOCUMENTS_ONLY;
  const publicOnly = flag === "1" || (env.NODE_ENV === "production" && flag !== "0");
  return { model, provider, publicOnly };
}
