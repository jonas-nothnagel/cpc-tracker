/**
 * Coherence Explorer chat route.
 *
 * Multi-step tool-loop. The model can both navigate the wheel (set_filter,
 * focus_category, select_target, set_mode) and *read* the underlying data
 * (get_pair_rationale, get_target_neighbors) before answering. Read tools
 * execute server-side; navigate tools are accumulated and returned to the
 * client as actions. Final reply is allowed to be a short grounded answer
 * (1-3 sentences) — strictly synthesized from tool results, never from the
 * model's prior knowledge.
 *
 * This is a deliberate loosening of the project's "no AI narrative reports"
 * rule for an experimental branch. Outputs are clearly labeled AI-generated
 * in the UI, kept short, and required to be data-grounded.
 *
 * Backend selection: Azure OpenAI when the deployment env vars are set
 * (matches production), OpenRouter otherwise (dev fallback).
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_ITERATIONS = 3;
const NEIGHBORS_LIMIT_DEFAULT = 8;

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
  /**
   * Pair records that have a rationale (typically high alignments + all
   * contradictions). Read tools query this in-memory; the model never sees
   * the full list verbatim, only the entries it requests.
   */
  pairs: {
    aId: string;
    bId: string;
    level: string;
    description: string;
  }[];
  /** Full text per visible target id — used by read tools when answering. */
  targetTexts: Record<string, string>;
  country: string | null;
}

type ChatAction =
  | { type: "set_filter"; filter: string }
  | { type: "focus_category"; categoryId: string }
  | { type: "select_target"; targetId: string }
  | { type: "set_mode"; mode: "document" | "globe" | "sector" }
  | { type: "noop" };

const SYSTEM_PROMPT = `You navigate a policy coherence visualization. Targets come from documents (NDC, NBSAP, BTR, NAP, etc.) and the wheel shows how they align or contradict.

Tools:
- READ: get_pair_rationale, get_target_neighbors. Use these to look up rationales and neighbours before answering "why", "how", or "what does X connect to". Results return to you mid-conversation.
- NAVIGATE: set_filter, focus_category, select_target, set_mode. These move the wheel.

Always include a "content" message in your final assistant turn — that's what the user reads. Two examples:

Example A — "Why does NBSAP 1 conflict with NDC livestock?"
Turn 1: call get_pair_rationale(nbsap_1, ndc_lvst). No content.
Turn 2: content = "They compete for steppe land — NBSAP 1 designates protected biodiversity zones while the livestock target relies on existing pastures." tool calls = [select_target(nbsap_1)].

Example B — "What does NBSAP 1 align with most?"
Turn 1: call get_target_neighbors(nbsap_1). No content.
Turn 2: content = "NBSAP 1 aligns most with NDC Biodiversity 1 (shared protected-area designation) and NDC Forests 1 (forest reserves)." tool calls = [select_target(nbsap_1)].

Example C — "Switch to biodiversity view"
Turn 1: content = "Grouped by biodiversity category." tool calls = [set_mode(globe)]. Done.

Example D — "Where do plans contradict most?"
Turn 1: content = "Green economy has the most potential conflicts." tool calls = [set_filter(contradictions), focus_category(green_economy)]. Use the precomputed rankings in the context. No reads needed.

Hard rules:
- Only use ids that appear in the context. Never invent.
- Every factual claim in content must come from a tool result you actually called this turn (or from the precomputed rankings). Never paraphrase from prior training.
- If get_pair_rationale returns found:false, say "No rationale on file for that pair." and stop — don't guess.
- Never recommend, advise, or judge. Only describe the data.
- Plain text only. No markdown, no bullets, no headings.
- No follow-up questions to the user.
- Replies stay under 60 words.`;

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
            description:
              "all = every alignment. high_medium = high and medium. high_contra = high and contradictions. high = high only. contradictions = contradictions only.",
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
        "Select a single target from the target index. The id must be one from the available targets list.",
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
  {
    type: "function",
    function: {
      name: "get_pair_rationale",
      description:
        "Look up the AI-generated rationale for why two specific targets align or contradict. Use this before answering questions like 'why do X and Y conflict?'. Returns level, description, and both targets' full text. Returns found:false if no rationale was recorded for the pair.",
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
      name: "get_target_neighbors",
      description:
        "Look up the strongest alignments and contradictions touching a specific target, sorted with contradictions first then high alignments. Returns up to `limit` neighbours (default 8) including the rationale text where available.",
      parameters: {
        type: "object",
        properties: {
          targetId: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 20 },
        },
        required: ["targetId"],
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

// Loose message type for the rolling history. role can be system / user /
// assistant / tool; tool messages carry tool_call_id.
type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

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
  // OpenRouter expects fully qualified model ids ("openai/gpt-4o-mini").
  // Allow LLM_MODEL to be either bare ("gpt-4o-mini") or qualified.
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

// ─── Read tool helpers ──────────────────────────────────────────────

/** Severity ordering: contradictions first (most severe), then high, etc. */
const LEVEL_ORDER: Record<string, number> = {
  high_contradiction: 0,
  moderate_contradiction: 1,
  low_tension: 2,
  high: 3,
  medium: 4,
  low: 5,
  none: 6,
};

function targetLabel(ctx: ChatContext, id: string): string {
  const t = ctx.targetIndex.find((x) => x.id === id);
  return t ? `${t.sourceDocument}: ${t.sourceLabel}` : id;
}

function readPairRationale(
  args: Record<string, unknown>,
  ctx: ChatContext,
): unknown {
  const aId = String(args.targetAId ?? "");
  const bId = String(args.targetBId ?? "");
  const found = ctx.pairs.find(
    (p) =>
      (p.aId === aId && p.bId === bId) || (p.aId === bId && p.bId === aId),
  );
  if (!found) {
    return {
      found: false,
      message: "No alignment rationale recorded for this pair.",
    };
  }
  return {
    found: true,
    level: found.level,
    description: found.description,
    targetA: { id: aId, label: targetLabel(ctx, aId), text: ctx.targetTexts[aId] ?? "" },
    targetB: { id: bId, label: targetLabel(ctx, bId), text: ctx.targetTexts[bId] ?? "" },
  };
}

function readTargetNeighbors(
  args: Record<string, unknown>,
  ctx: ChatContext,
): unknown {
  const targetId = String(args.targetId ?? "");
  const limit = Math.max(
    1,
    Math.min(20, Number(args.limit ?? NEIGHBORS_LIMIT_DEFAULT)),
  );
  const t = ctx.targetIndex.find((x) => x.id === targetId);
  if (!t) {
    return { found: false, message: "Unknown targetId." };
  }
  const matches = ctx.pairs
    .filter((p) => p.aId === targetId || p.bId === targetId)
    .map((p) => {
      const otherId = p.aId === targetId ? p.bId : p.aId;
      return {
        otherTargetId: otherId,
        otherTargetLabel: targetLabel(ctx, otherId),
        level: p.level,
        description: p.description,
      };
    })
    .sort(
      (a, b) =>
        (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9),
    )
    .slice(0, limit);
  return {
    found: true,
    target: { id: targetId, label: targetLabel(ctx, targetId), text: ctx.targetTexts[targetId] ?? "" },
    neighbors: matches,
    truncated: matches.length === limit,
  };
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
  noop: 4,
};

async function callLlm(messages: ChatMessage[]): Promise<LlmResponse> {
  if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) {
    return callAzure(messages);
  }
  if (process.env.OPENROUTER_API_KEY) {
    return callOpenRouter(messages);
  }
  throw new Error("No LLM backend configured.");
}

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

  // Defensive fallbacks: older clients may not include the new fields.
  if (!Array.isArray(context.pairs)) context.pairs = [];
  if (!context.targetTexts) context.targetTexts = {};

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserMessage(query, context) },
  ];

  const groupIds = new Set(context.groups.map((g) => g.id));
  const targetIds = new Set(context.targetIndex.map((t) => t.id));

  const actionByType = new Map<ChatAction["type"], ChatAction>();
  let lastContent = "";
  // Capture rationale text the model actually read this turn so we can fall
  // back to a grounded reply if the model declines to write content.
  // gpt-4o-mini sometimes emits select_target without an accompanying summary
  // even with strong instructions; this lets the user still see the data.
  const readDescriptions: string[] = [];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
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
    if (!message) break;

    const content = (message.content ?? "").trim();
    if (content) lastContent = content;

    const toolCalls = message.tool_calls ?? [];

    // Push the assistant turn verbatim so subsequent calls have the full
    // tool-call history. OpenAI requires every tool_call to have a matching
    // tool message before the next assistant turn.
    messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    });

    if (toolCalls.length === 0) break;

    let didReadTool = false;

    for (const toolCall of toolCalls) {
      const fnName = toolCall.function?.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolCall.function?.arguments ?? "{}");
      } catch {
        args = {};
      }

      let toolResult: unknown = { ok: true };

      if (fnName === "get_pair_rationale") {
        const r = readPairRationale(args, context) as {
          found: boolean;
          description?: string;
          targetA?: { label: string };
          targetB?: { label: string };
        };
        toolResult = r;
        didReadTool = true;
        if (r.found && r.description) {
          readDescriptions.push(
            `${r.targetA?.label} ↔ ${r.targetB?.label}: ${r.description}`,
          );
        }
      } else if (fnName === "get_target_neighbors") {
        const r = readTargetNeighbors(args, context) as {
          found: boolean;
          target?: { label: string };
          neighbors?: { otherTargetLabel: string; description: string }[];
        };
        toolResult = r;
        didReadTool = true;
        if (r.found && r.neighbors && r.neighbors.length > 0) {
          const top = r.neighbors
            .slice(0, 3)
            .map((n) => `${n.otherTargetLabel} (${n.description.slice(0, 100)})`)
            .join("; ");
          readDescriptions.push(`${r.target?.label} → ${top}`);
        }
      } else if (fnName === "set_filter") {
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
        } else {
          toolResult = { ok: false, error: "invalid filter" };
        }
      } else if (fnName === "focus_category") {
        const id = String(args.categoryId ?? "");
        if (groupIds.has(id)) {
          actionByType.set("focus_category", {
            type: "focus_category",
            categoryId: id,
          });
        } else {
          toolResult = { ok: false, error: "unknown categoryId" };
        }
      } else if (fnName === "select_target") {
        const id = String(args.targetId ?? "");
        if (targetIds.has(id)) {
          actionByType.set("select_target", {
            type: "select_target",
            targetId: id,
          });
        } else {
          toolResult = { ok: false, error: "unknown targetId" };
        }
      } else if (fnName === "set_mode") {
        const mode = String(args.mode ?? "");
        if (mode === "document" || mode === "globe" || mode === "sector") {
          actionByType.set("set_mode", { type: "set_mode", mode });
        } else {
          toolResult = { ok: false, error: "invalid mode" };
        }
      } else {
        toolResult = { ok: false, error: `unknown tool: ${fnName}` };
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id ?? "",
        content: JSON.stringify(toolResult),
      });
    }

    // If only navigation tools fired this turn, the model has nothing to
    // synthesize and we'd just be paying for another round-trip. Done.
    if (!didReadTool) break;
  }

  const actions = Array.from(actionByType.values()).sort(
    (a, b) => ACTION_ORDER[a.type] - ACTION_ORDER[b.type],
  );

  // Synthesize a fallback reply only if the model never spoke up.
  let reply = lastContent;
  // If the model declined to summarize despite reading rationale data, surface
  // the raw rationale as a graceful fallback so the user still sees evidence.
  if (!reply && readDescriptions.length > 0) {
    reply = readDescriptions.join(" — ");
    if (reply.length > 350) reply = reply.slice(0, 347) + "…";
  }
  if (!reply && actions.length > 0) {
    const parts: string[] = [];
    for (const a of actions) {
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

  return NextResponse.json({ reply, actions });
}
