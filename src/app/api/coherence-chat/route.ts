/**
 * Coherence Explorer chat route.
 *
 * Accepts a free-text question + a compact view-state context (current mode,
 * filter, available groups, and a small target index) and returns a single
 * navigation action plus a one-sentence reply. The model is locked to a
 * fixed tool set — no narrative-paragraph mode — so the chat can drive the
 * wheel without violating the project rule against AI-written policy text.
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
  | { type: "set_mode"; mode: "document" | "globe" | "sector" }
  | { type: "noop" };

const SYSTEM_PROMPT = `You are a navigation assistant for a policy coherence visualization. The user looks at a chord chart of policy targets across documents (NDC, NBSAP, BTR, NAP, etc.) and explores how the targets align or contradict.

You may emit ONE OR MORE tool calls per turn — combine them when the request needs both a filter and a focus. Do NOT write narrative paragraphs about the data. Always include a single short content message (max ~20 words) saying what you're showing.

Rules:
- Only use ids that appear in the context. Never invent ids.
- For aggregate questions about contradictions, prefer set_filter('contradictions') AND focus_category(top tension group). For "highest alignment" prefer set_filter('high') AND focus_category(top alignment group).
- For target lookups ("find targets about X") match snippets to the topic and call select_target with the best match.
- For "show a target that's both aligned and contested", pick a target that appears in BOTH topTargetsByTension and topTargetsByAlignment, set_filter('high_contra'), and select_target.
- For mode switches ("biodiversity view", "by document", "climate sector") call set_mode only.
- For filter switches ("show only contradictions", "high alignments only") call set_filter only.
- If you can't pick a useful action, return a short reply explaining why and call no tool.`;

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

interface LlmResponse {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: {
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
}

async function callAzure(
  messages: { role: string; content: string }[],
): Promise<LlmResponse> {
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

async function callOpenRouter(
  messages: { role: string; content: string }[],
): Promise<LlmResponse> {
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

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserMessage(query, context) },
  ];

  let response: LlmResponse;
  try {
    if (
      process.env.AZURE_OPENAI_ENDPOINT &&
      process.env.AZURE_OPENAI_API_KEY
    ) {
      response = await callAzure(messages);
    } else if (process.env.OPENROUTER_API_KEY) {
      response = await callOpenRouter(messages);
    } else {
      return NextResponse.json(
        { error: "No LLM backend configured." },
        { status: 500 },
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "LLM call failed" },
      { status: 502 },
    );
  }

  const message = response.choices?.[0]?.message;
  const toolCalls = message?.tool_calls ?? [];
  const content = (message?.content ?? "").trim();

  // Validate against context — never trust LLM-emitted ids blindly.
  const groupIds = new Set(context.groups.map((g) => g.id));
  const targetIds = new Set(context.targetIndex.map((t) => t.id));

  const actions: ChatAction[] = [];
  // Action ordering matters in the client: set_mode resets selection, so it
  // must run before focus/select. set_filter is independent. Sort here so the
  // client can apply blindly.
  const ACTION_ORDER: Record<ChatAction["type"], number> = {
    set_mode: 0,
    set_filter: 1,
    focus_category: 2,
    select_target: 3,
    noop: 4,
  };

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
        actions.push({ type: "set_filter", filter });
      }
    } else if (fnName === "focus_category") {
      const id = String(args.categoryId ?? "");
      if (groupIds.has(id)) {
        actions.push({ type: "focus_category", categoryId: id });
      }
    } else if (fnName === "select_target") {
      const id = String(args.targetId ?? "");
      if (targetIds.has(id)) {
        actions.push({ type: "select_target", targetId: id });
      }
    } else if (fnName === "set_mode") {
      const mode = String(args.mode ?? "");
      if (mode === "document" || mode === "globe" || mode === "sector") {
        actions.push({ type: "set_mode", mode });
      }
    }
  }

  actions.sort((a, b) => ACTION_ORDER[a.type] - ACTION_ORDER[b.type]);

  // Reply: prefer the model's own one-liner; fall back to a synthesised
  // sentence from the actions if the model didn't include content.
  let reply = content;
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
