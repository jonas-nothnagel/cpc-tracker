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

Take ONE action per turn by calling exactly one of the provided tools. Do NOT write narrative paragraphs about the data. Your reply text is a single short sentence (max ~20 words) saying what you're showing.

Rules:
- Only use ids that appear in the context. Never invent ids.
- For aggregate questions ("where do plans contradict most?") pick a sensible group from the available groups and call focus_category.
- For target lookups ("find targets about X") match snippets to the topic and call select_target with the best match.
- For mode switches ("biodiversity view", "by document", "climate sector") call set_mode.
- For filter switches ("show only contradictions", "high alignments only") call set_filter.
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
  const toolCall = message?.tool_calls?.[0];
  const content = (message?.content ?? "").trim();

  if (!toolCall) {
    return NextResponse.json({
      reply: content || "I'm not sure what to show for that.",
      action: { type: "noop" } as ChatAction,
    });
  }

  const fnName = toolCall.function?.name;
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(toolCall.function?.arguments ?? "{}");
  } catch {
    args = {};
  }

  // Validate against context — never trust LLM-emitted ids blindly.
  const groupIds = new Set(context.groups.map((g) => g.id));
  const targetIds = new Set(context.targetIndex.map((t) => t.id));

  let action: ChatAction = { type: "noop" };
  let reply = content;

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
      action = { type: "set_filter", filter };
      if (!reply) reply = `Showing ${filter.replace("_", " + ")}.`;
    }
  } else if (fnName === "focus_category") {
    const id = String(args.categoryId ?? "");
    if (groupIds.has(id)) {
      action = { type: "focus_category", categoryId: id };
      const label = context.groups.find((g) => g.id === id)?.label ?? id;
      if (!reply) reply = `Focusing ${label}.`;
    }
  } else if (fnName === "select_target") {
    const id = String(args.targetId ?? "");
    if (targetIds.has(id)) {
      action = { type: "select_target", targetId: id };
      const t = context.targetIndex.find((tt) => tt.id === id);
      const label = t ? `${t.sourceDocument}: ${t.sourceLabel}` : id;
      if (!reply) reply = `Showing ${label}.`;
    }
  } else if (fnName === "set_mode") {
    const mode = String(args.mode ?? "");
    if (mode === "document" || mode === "globe" || mode === "sector") {
      action = { type: "set_mode", mode };
      const labels: Record<string, string> = {
        document: "by document type",
        globe: "by biodiversity category",
        sector: "by climate mitigation sector",
      };
      if (!reply) reply = `Switched to grouping ${labels[mode]}.`;
    }
  }

  if (action.type === "noop" && !reply) {
    reply = "I couldn't map that to an action — try one of the examples?";
  }

  return NextResponse.json({ reply, action });
}
