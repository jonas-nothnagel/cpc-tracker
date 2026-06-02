import type { FootprintSource } from "./types";

/**
 * Hosted EcoLogits estimation client for chat (TypeScript) LLM calls, which run
 * outside the Python pipeline's in-process EcoLogits instrumentation.
 *
 * Data sovereignty: we send ONLY the output token count + model name. No prompt,
 * no policy content, nothing the user typed. See docs/CARBON_METHODOLOGY.md.
 */

interface EstimateInput {
  model: string;
  outputTokens: number;
  latencyS?: number;
  zone?: string;
}

export interface ChatImpacts {
  energy_wh: number;
  water_ml: number;
  co2_geq: number;
  minerals_ugsbeq: number;
  source: FootprintSource;
}

const API_URL = "https://api.ecologits.ai/v1beta/estimations";
const TIMEOUT_MS = 4000;

/**
 * Estimate the environmental impact of one chat completion. On any failure or
 * timeout, returns a zero-impact "unavailable" result so the caller can still
 * record that the call happened.
 *
 * Response shape (verified): { impacts: { energy|gwp|adpe|wcf|usage: { value:
 * { min, max }, unit } } }. We take the midpoint and convert to our units
 * (Wh / gCO2eq / ugSbeq / mL), reading water from impacts.usage.wcf to match
 * the Python pipeline's extraction.
 */
export async function estimateChatImpacts(
  input: EstimateInput,
): Promise<ChatImpacts> {
  const fallback: ChatImpacts = {
    energy_wh: 0,
    water_ml: 0,
    co2_geq: 0,
    minerals_ugsbeq: 0,
    source: "unavailable",
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const body: Record<string, unknown> = {
      provider: "openai",
      model_name: input.model.replace(/^openai\//, ""),
      output_token_count: input.outputTokens,
    };
    if (input.latencyS) body.request_latency = input.latencyS;
    if (input.zone) body.electricity_mix_zone = input.zone;

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return fallback;

    const json = (await res.json()) as { impacts?: Record<string, unknown> };
    const impacts = json.impacts ?? {};
    const usage = (impacts.usage ?? {}) as Record<string, unknown>;
    return {
      energy_wh: midpoint(impacts.energy) * 1000, // kWh -> Wh
      co2_geq: midpoint(impacts.gwp) * 1000, // kgCO2eq -> gCO2eq
      minerals_ugsbeq: midpoint(impacts.adpe) * 1e9, // kgSbeq -> ugSbeq
      water_ml: midpoint(usage.wcf ?? impacts.wcf) * 1000, // L -> mL
      source: "api",
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract a numeric midpoint from an EcoLogits impact field. The field is
 * { value: { min, max } } (a RangeValue) or { value: number }.
 */
export function midpoint(field: unknown): number {
  if (field && typeof field === "object" && "value" in field) {
    const value = (field as { value: unknown }).value;
    if (value && typeof value === "object" && "min" in value && "max" in value) {
      const range = value as { min: number; max: number };
      return (Number(range.min) + Number(range.max)) / 2;
    }
    return Number(value) || 0;
  }
  return Number(field) || 0;
}
