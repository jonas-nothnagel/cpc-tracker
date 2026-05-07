/**
 * Coherence Explorer chat route — navigation-only.
 *
 * The chat picks one or more navigation actions (set_filter, focus_category,
 * select_target, select_pair, set_mode) and writes a single short
 * confirmatory sentence. It does NOT generate analytical text from
 * underlying data — analysis lives in the DetailPanel's pair-rationale
 * display, where it's anchored to the actual pair the user clicked on.
 *
 * Earlier experiments with read tools (get_pair_rationale,
 * get_target_neighbors, get_pairs_filtered) were removed: they competed
 * for attention with the wheel and panel without adding reliable value.
 * The wheel + panel ARE the answer; the chat is the navigation shortcut.
 *
 * Backend selection: Azure OpenAI when the deployment env vars are set
 * (matches production), OpenRouter otherwise (dev fallback).
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface RankedItem {
  id: string;
  label: string;
  count: number;
}

interface ChatContext {
  mode: "document" | "globe" | "sector";
  filter: string;
  groups: { id: string; label: string }[];
  targetIndex: {
    id: string;
    sourceLabel: string;
    sourceDocument: string;
    snippet: string;
  }[];
  rankings?: {
    topGroupsByTension: RankedItem[];
    topGroupsByAlignment: RankedItem[];
    topTargetsByTension: RankedItem[];
    topTargetsByAlignment: RankedItem[];
  };
  country: string | null;
}

type ChatAction =
  | { type: "set_filter"; filter: string }
  | { type: "focus_category"; categoryId: string }
  | { type: "select_target"; targetId: string }
  | { type: "select_pair"; targetAId: string; targetBId: string }
  | { type: "set_mode"; mode: "document" | "globe" | "sector" }
  | { type: "noop" };

const SYSTEM_PROMPT = `You navigate a policy coherence visualization. Targets come from documents (NDC, NBSAP, BTR, NAP, etc.) and the wheel shows how they align or contradict.

Your job: pick the right combination of NAVIGATE tools to bring the user to the view that answers their question, then write ONE short confirmatory sentence (max ~15 words). The wheel and the side panel show the actual data — your sentence just confirms what's now in view. You do not summarise rationales, generate analysis, or write paragraphs.

Tools:
- set_filter(filter): all | high_medium | high_contra | high | contradictions
- focus_category(categoryId): focus a group on the wheel
- select_target(targetId): select a single target (opens its detail panel with all its connections and rationales)
- select_pair(targetAId, targetBId): open the pair compare view directly (best for "why X conflicts with Y" — the rationale is shown automatically there)
- set_mode(mode): document | globe | sector

Patterns:
- "Where do plans contradict most?" → set_filter(contradictions) + focus_category(top tension group from rankings). Reply: "Showing top contradictions in <group>."
- "Why does NBSAP 1 conflict with NDC livestock?" → select_pair(nbsap_1, ndc_lvst). Reply: "Opened the NBSAP 1 ↔ NDC Livestock pair — rationale shown."
- "What does NBSAP 1 align with?" → select_target(nbsap_1). Reply: "Selected NBSAP 1 — its connections are listed."
- "Switch to biodiversity view" → set_mode(globe). Reply: "Grouped by biodiversity category."
- "Find livestock targets" → select_target(<best snippet match>). Reply: "Showing NDC: Livestock mitigation."
- "Top conflicts for biodiversity" → set_filter(contradictions) + focus_category(<biodiversity-related group, e.g. NBSAP>). Reply: "Showing biodiversity contradictions in <group>."

Hard rules:
- Only use ids that appear in the context. Never invent ids.
- Plain text only. No markdown, no asterisks, no bullets, no quotes around the reply.
- One sentence. ~15 words. No follow-up questions to the user.
- No analysis, recommendations, or value judgements. Describe only the resulting view ("Showing X.", "Opened X.", "Selected X.").
- Use the precomputed rankings to pick the right group/target for aggregate questions — don't guess.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "set_filter",
      description: "Switch the alignment filter shown on the wheel.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            enum: [
              "all",
              "high_medium",
              "high_contra",
              "high",
              "contradictions",
            ],
          },
        },
        required: ["filter"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "focus_category",
      description:
        "Focus a specific category arc (group) on the wheel. The id must be one from the available groups list.",
      parameters: {
        type: "object",
        properties: { categoryId: { type: "string" } },
        required: ["categoryId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "select_target",
      description:
        "Select a single target from the target index. Opens the target's detail panel which lists all its alignments and contradictions and lets the user click any pair to read its rationale.",
      parameters: {
        type: "object",
        properties: { targetId: { type: "string" } },
        required: ["targetId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "select_pair",
      description:
        "Open the pair-compare view for two specific targets. This is the best action for 'why does X conflict with Y' or 'how does X relate to Y' questions — the rationale text for the pair is shown automatically in the compare panel. If no alignment exists between the two ids the client falls back to selecting the first target.",
      parameters: {
        type: "object",
        properties: {
          targetAId: { type: "string" },
          targetBId: { type: "string" },
        },
        required: ["targetAId", "targetBId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_mode",
      description:
        "Switch the wheel grouping mode. document = group arcs by source document. globe = group by biodiversity (GLOBE) category. sector = group by climate mitigation (IPCC) sector.",
      parameters: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["document", "globe", "sector"] },
        },
        required: ["mode"],
        additionalProperties: false,
      },
    },
  },
];

function fmtRanking(title: string, items: RankedItem[] | undefined): string {
  if (!items || items.length === 0) return "";
  const lines = items
    .map((it, i) => `${i + 1}. ${it.id} (${it.label}) — ${it.count}`)
    .join("\n");
  return `${title}:\n${lines}\n`;
}

function buildUserMessage(query: string, ctx: ChatContext): string {
  const groups = ctx.groups.map((g) => `${g.id} | ${g.label}`).join("\n");
  const targets = ctx.targetIndex
    .map((t) => {
      const snippet = t.snippet.replace(/\s+/g, " ").slice(0, 120);
      return `${t.id} | ${t.sourceDocument}: ${t.sourceLabel} | ${snippet}`;
    })
    .join("\n");
  const r = ctx.rankings;
  const rankings = r
    ? [
        fmtRanking("Top groups by potential tensions", r.topGroupsByTension),
        fmtRanking("Top groups by high alignments", r.topGroupsByAlignment),
        fmtRanking("Top targets by potential tensions", r.topTargetsByTension),
        fmtRanking("Top targets by high alignments", r.topTargetsByAlignment),
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const sections: string[] = [
    `Country: ${ctx.country ?? "Unknown"}`,
    `Current mode: ${ctx.mode}`,
    `Current filter: ${ctx.filter}`,
    "",
    "Available groups (id | label):",
    groups || "(none)",
    "",
  ];
  if (rankings) {
    sections.push(
      "Pre-computed rankings (use these for aggregate questions):",
      rankings,
    );
  }
  sections.push(
    `Available targets — ${ctx.targetIndex.length} total (id | doc: label | snippet):`,
    targets || "(none)",
    "",
    `User question: ${query}`,
  );
  return sections.join("\n");
}

interface ToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface AssistantMessage {
  role?: "assistant";
  content?: string | null;
  tool_calls?: ToolCall[];
}

interface LlmResponse {
  choices?: { message?: AssistantMessage }[];
}

type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string };

async function callAzure(messages: ChatMessage[]): Promise<LlmResponse> {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/$/, "");
  const apiKey = process.env.AZURE_OPENAI_API_KEY ?? "";
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21";
  const deployment = process.env.LLM_MODEL ?? "gpt-4o-mini";
  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure call failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<LlmResponse>;
}

async function callOpenRouter(messages: ChatMessage[]): Promise<LlmResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  const raw = process.env.LLM_MODEL ?? "openai/gpt-4o-mini";
  const model = raw.includes("/") ? raw : `openai/${raw}`;
  const baseUrl = (
    process.env.LLM_BASE_URL ?? "https://openrouter.ai/api/v1"
  ).replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `OpenRouter call failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }
  return res.json() as Promise<LlmResponse>;
}

async function callLlm(messages: ChatMessage[]): Promise<LlmResponse> {
  if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) {
    return callAzure(messages);
  }
  if (process.env.OPENROUTER_API_KEY) {
    return callOpenRouter(messages);
  }
  throw new Error("No LLM backend configured.");
}

// ─── Action ordering for the client ─────────────────────────────────
//
// set_mode resets the selection state on the client, so it must run before
// focus/select. set_filter is independent. The server pre-sorts so the
// client can apply blindly.
const ACTION_ORDER: Record<ChatAction["type"], number> = {
  set_mode: 0,
  set_filter: 1,
  focus_category: 2,
  select_target: 3,
  select_pair: 4,
  noop: 5,
};

export async function POST(req: Request) {
  let body: { query?: string; context?: ChatContext };
  try {
    body = (await req.json()) as { query?: string; context?: ChatContext };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const query = (body.query ?? "").trim();
  const context = body.context;
  if (!query) {
    return NextResponse.json({ error: "Empty query" }, { status: 400 });
  }
  if (!context) {
    return NextResponse.json({ error: "Missing context" }, { status: 400 });
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserMessage(query, context) },
  ];

  let response: LlmResponse;
  try {
    response = await callLlm(messages);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "LLM call failed" },
      { status: 502 },
    );
  }

  const message = response.choices?.[0]?.message;
  const toolCalls = message?.tool_calls ?? [];
  // Strip prompt-format leaks: occasionally the model echoes the example
  // syntax ("Content: ...", 'reply: "..."') verbatim.
  let content = (message?.content ?? "").trim();
  content = content
    .replace(/^\s*content\s*=\s*"?/i, "")
    .replace(/^\s*content\s*:\s*"?/i, "")
    .replace(/^\s*reply\s*:\s*"?/i, "")
    .replace(/"\s*$/, "")
    .trim();

  const groupIds = new Set(context.groups.map((g) => g.id));
  const targetIds = new Set(context.targetIndex.map((t) => t.id));
  const actionByType = new Map<ChatAction["type"], ChatAction>();

  for (const toolCall of toolCalls) {
    const fnName = toolCall.function?.name;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(toolCall.function?.arguments ?? "{}");
    } catch {
      args = {};
    }

    if (fnName === "set_filter") {
      const filter = String(args.filter ?? "");
      const allowed = [
        "all",
        "high_medium",
        "high_contra",
        "high",
        "contradictions",
      ];
      if (allowed.includes(filter)) {
        actionByType.set("set_filter", { type: "set_filter", filter });
      }
    } else if (fnName === "focus_category") {
      const id = String(args.categoryId ?? "");
      if (groupIds.has(id)) {
        actionByType.set("focus_category", {
          type: "focus_category",
          categoryId: id,
        });
      }
    } else if (fnName === "select_target") {
      const id = String(args.targetId ?? "");
      if (targetIds.has(id)) {
        actionByType.set("select_target", {
          type: "select_target",
          targetId: id,
        });
      }
    } else if (fnName === "select_pair") {
      const aId = String(args.targetAId ?? "");
      const bId = String(args.targetBId ?? "");
      if (targetIds.has(aId) && targetIds.has(bId) && aId !== bId) {
        actionByType.set("select_pair", {
          type: "select_pair",
          targetAId: aId,
          targetBId: bId,
        });
      }
    } else if (fnName === "set_mode") {
      const mode = String(args.mode ?? "");
      if (mode === "document" || mode === "globe" || mode === "sector") {
        actionByType.set("set_mode", { type: "set_mode", mode });
      }
    }
  }

  const actions = Array.from(actionByType.values()).sort(
    (a, b) => ACTION_ORDER[a.type] - ACTION_ORDER[b.type],
  );

  // select_target and select_pair are mutually exclusive; pair wins when both
  // are present (more specific intent).
  const finalActions = actions.filter(
    (a) =>
      !(
        a.type === "select_target" &&
        actionByType.has("select_pair")
      ),
  );

  // Synthesise a fallback reply only if the model didn't speak.
  let reply = content;
  if (!reply && finalActions.length > 0) {
    const parts: string[] = [];
    for (const a of finalActions) {
      if (a.type === "set_filter") {
        parts.push(`Filter: ${a.filter.replace("_", " + ")}.`);
      } else if (a.type === "focus_category") {
        const label =
          context.groups.find((g) => g.id === a.categoryId)?.label ??
          a.categoryId;
        parts.push(`Focusing ${label}.`);
      } else if (a.type === "select_target") {
        const t = context.targetIndex.find((tt) => tt.id === a.targetId);
        parts.push(
          `Showing ${t ? `${t.sourceDocument}: ${t.sourceLabel}` : a.targetId}.`,
        );
      } else if (a.type === "select_pair") {
        const tA = context.targetIndex.find((tt) => tt.id === a.targetAId);
        const tB = context.targetIndex.find((tt) => tt.id === a.targetBId);
        const aL = tA ? `${tA.sourceDocument}: ${tA.sourceLabel}` : a.targetAId;
        const bL = tB ? `${tB.sourceDocument}: ${tB.sourceLabel}` : a.targetBId;
        parts.push(`Opened ${aL} ↔ ${bL}.`);
      } else if (a.type === "set_mode") {
        const labels: Record<string, string> = {
          document: "by document type",
          globe: "by biodiversity category",
          sector: "by climate mitigation sector",
        };
        parts.push(`Grouped ${labels[a.mode]}.`);
      }
    }
    reply = parts.join(" ");
  }
  if (!reply) {
    reply = "I couldn't map that to an action — try one of the examples?";
  }

  return NextResponse.json({ reply, actions: finalActions });
}
