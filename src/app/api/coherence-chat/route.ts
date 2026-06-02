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

import { appendEvent } from "@/lib/footprint/ledger";
import { estimateChatImpacts } from "@/lib/footprint/ecologits-api";

export const runtime = "nodejs";

interface RankedItem {
  id: string;
  label: string;
  count: number;
}

interface PrimaryRef {
  id: string;
  name: string;
}

interface PrimaryAdaptation {
  id: string;
  description: string;
}

interface ChatContext {
  mode: "document" | "globe" | "sector";
  filter: string;
  /** Legacy field; always "all_documents" in current callers. The chat now
   *  sees the full corpus on every turn. Kept optional in case stale
   *  clients still send "current_view". */
  scope?: "current_view" | "all_documents";
  groups: { id: string; label: string }[];
  /** Subset of group ids the user currently has toggled on. The model
   *  compares this against `groups` to decide whether to emit show_docs. */
  visibleDocs?: string[];
  /** Document-type registry from the country config. Provides full names
   *  for the doc ids so the model can expand abbreviations on first
   *  mention without relying on a country-specific gloss in the system
   *  prompt. */
  documentTypes?: { id: string; fullLabel: string }[];
  targetIndex: {
    id: string;
    sourceLabel: string;
    sourceDocument: string;
    /** Full target text (not a snippet). */
    text: string;
    actionType?: "mitigation" | "adaptation";
    isQuantitative?: boolean;
    isTimeBound?: boolean;
    primaryGlobe?: PrimaryRef;
    primarySector?: PrimaryRef;
    primaryAdaptationGoal?: PrimaryAdaptation;
  }[];
  /** Taxonomy lists with descriptions so the model can resolve free-text
   * topics ("pollution", "restoration") to a concrete category id. */
  taxonomies?: {
    globe: { id: string; name: string; description?: string }[];
    sector: { id: string; name: string; description?: string }[];
    adaptation: { id: string; description: string }[];
  };
  /** AI-generated rationales for every non-"none" alignment pair. */
  pairs?: {
    a: string;
    b: string;
    level: string;
    mechanism?: string;
    manageability?: string;
    confidence?: string;
    rationale: string;
  }[];
  /** Top-5 rankings derived from the full corpus. */
  rankings?: {
    topGroupsByTension: RankedItem[];
    topGroupsByAlignment: RankedItem[];
    topTargetsByTension: RankedItem[];
    topTargetsByAlignment: RankedItem[];
  };
  /** Per-primary-GLOBE budget rollup. Present when the country has BER
   *  (Biodiversity Expenditure Review) data classified to GLOBE
   *  subcategories. Always supplied regardless of which lens the user is on
   *  so a user can ask budget questions from any view. */
  budgetByCategory?: {
    categoryId: string;
    categoryName: string;
    /** Cumulative tagged BER spend in `budgetMeta.unit` (typically billions of
     *  `budgetMeta.currency`). */
    totalBudget: number;
    /** Share of the total tagged BER spend across all primary categories,
     *  0..1. */
    shareOfTotalBudget: number;
    targetCount: number;
    shareOfTargets: number;
    contradictionPairCount: number;
  }[];
  /** Metadata for the budget block: currency, unit, reporting period. */
  budgetMeta?: {
    currency: string;
    unit: string;
    period: { start: number; end: number };
    totalBudget: number;
  };
  /** Precomputed synthesis artifacts from the pipeline: corpus-level
   *  storylines + summary, per-doc-pair narratives, and per-theme narratives.
   *  AI-generated; present only when the country's run produced them. Lets the
   *  chat answer big-picture questions from the derived narrative instead of
   *  re-deriving it from raw pairs. */
  synthesis?: {
    corpus?: {
      summary: string;
      storylines: { name: string; type: string; description: string }[];
    };
    docPairs?: {
      a: string;
      b: string;
      storyline: string;
      reinforce: string;
      clash: string;
      coordination: string;
    }[];
    sectors?: {
      category: string;
      reinforce: string;
      clash: string;
      coordination: string;
    }[];
  };
  country: string | null;
}

type ChatAction =
  | { type: "set_filter"; filter: string }
  | { type: "focus_category"; categoryId: string }
  | { type: "select_target"; targetId: string }
  | { type: "select_pair"; targetAId: string; targetBId: string }
  | { type: "set_mode"; mode: "document" | "globe" | "sector" }
  /** Unhide one or more docs so the next action's target is visible. */
  | { type: "show_docs"; ids: string[] }
  | { type: "noop" };

interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `ABOUT THIS TOOL AND WHO YOU SERVE
You are the chat assistant inside the UNDP Climate-Policy Coherence Tracker, a decision-support tool for UNDP country office staff and national policymakers. Most users are not data scientists; they want clear factual answers in plain language about how their country's policies fit together.

The tool examines three levels: (1) coherence between policy targets across documents, which is what you mainly answer about, (2) financial alignment, forthcoming, (3) implementation progress, surfaced today through BTR (Biennial Transparency Report) entries that record what is already happening on the ground.

Your stance is decision-support, not decision-maker. Lead with what the data shows. When the user asks how coherence could be improved, what they could do, or how to address a specific tension, you may also suggest process-level pathways (boundary review, joint M&E, coordination across documents, indicator alignment, sequencing) that reference the visible evidence. Use hedged phrasing ("could potentially", "may help", "consider"), never "should" or "must". Do not prescribe country-specific policy choices ("reduce subsidy X", "cut target Y") and do not name a single ministry as lagging. Keep language neutral: an alignment gap is "an opportunity for stronger coherence," not "ministry X is failing." Comparative coherence outputs have historically been used to assign political blame, that risk is real.

THE DATASET
Targets come from policy documents the country has published. The user message lists the documents currently in this corpus under DATA, including their short ids and full names. Expand abbreviations on first mention if the user is unlikely to know them.

Policy targets describe what the country PLANS to do. BTR entries describe what the country has REPORTED as already happening (status: Implemented, Ongoing, Adopted, Planned). A flagged misalignment between a BTR entry and a policy target is qualitatively sharper than two plans disagreeing on paper, it means a reported action conflicts with a stated plan. Surface this framing when a BTR id appears in a pair the user is asking about.

YOUR JOB
Write a factual ANSWER (3 to 5 short sentences, 60 to 95 words) using the precomputed rankings, pair rationales, target index, topic resolution, and, when present, the precomputed synthesis. Lead with the most relevant fact (the count, the top entry, or the sharpest pair). Every number and label must trace to the context. Stop early if you would have to invent a number.

Then call navigation tools so the user can see the evidence on the wheel via a Show me button. The answer text is REQUIRED; always write it, even when calling tools.

WHEN TO CALL A NAVIGATION TOOL
When your answer names a specific pair, target, or document group as the focal evidence, you MUST also call the corresponding navigation tool:
- "X versus Y" / "X conflicts with Y" -> select_pair(X_id, Y_id)
- "X is the most contested target" -> select_target(X_id)
- "Group G carries the most tensions" -> focus_category(G_id)

If the answer says "no matches in the data" or is purely descriptive of the dataset as a whole, do not call navigation tools.

Failure mode to avoid: writing a comparative sentence and forgetting the corresponding tool call hides the Show me button, and the user, who is typically a non-technical policymaker, has no way to navigate to the underlying evidence. Treat the tool call as part of the answer, not an afterthought.

TOOLS
- set_filter(filter): all | high_medium | high_contra | high | contradictions
- focus_category(categoryId): focus a group arc on the wheel
- select_target(targetId): open the target detail panel
- select_pair(targetAId, targetBId): open the pair compare view, best for "why X conflicts with Y" since the rationale renders automatically
- set_mode(mode): document | globe | sector
- show_docs(ids): unhide a hidden document group; call BEFORE focus / select if your target's doc is currently hidden

SCOPE OF THIS TURN
The user message lists which documents are currently visible on the wheel under "USER'S CURRENT VIEW". The DATA block has already been filtered to only the visible documents. Reason and answer only over that subset. When the user has hidden documents, that signals intent to focus. If they ask a question whose answer would require hidden documents, say so plainly without naming what is missing.

CONVERSATION MEMORY
If a "Conversation context" line is present, resolve referring expressions ("it", "this", "what about X") against the prior selection or focus. Do not ask the user to clarify; pick the most likely referent.

BUDGET DATA (when present)
When the user message includes a BUDGET BY GLOBE CATEGORY block, you may answer questions about how a country's tagged biodiversity expenditure (BER, Biodiversity Expenditure Review) is distributed across primary GLOBE categories. The block lists, per primary category: total tagged spend, share of total tagged spend, target count, share of targets, and count of flagged conflict pairs. Always qualify figures as "tagged BER spend" or "in the uploaded BER", since the BER is a subset of national expenditure, not the full budget. Never call a category "underfunded" as a verdict; describe shares and counts as observations. Acceptable framings: "X has Y% of tagged BER spend against Z% of GLOBE-tagged targets", "X has the most flagged pairs and the smallest budget share in this view". The currency, unit, and reporting period live in the block's header line; quote them on first mention of a figure.

PRECOMPUTED SYNTHESIS (when present)
The user message may include a PRECOMPUTED SYNTHESIS block: AI-generated storylines across the whole corpus, per-document-pair summaries (where two documents align or potentially misalign, plus a coordination pointer), and per-theme summaries. The pipeline derived these from the same pairs you can see. Draw on them for big-picture questions like the main storyline, how two documents relate overall, or what a theme's potential misalignment is about, and you may pass along a coordination pointer in the same hedged phrasing. These are AI-generated summaries, not ground truth: keep the neutral, decision-support framing and do not present them as certain. When you name a specific storyline, document pair, or theme as the focal evidence, still call the matching navigation tool so the Show me button appears.

HARD RULES
- 3 to 5 short sentences, 60 to 95 words.
- Plain text only. No markdown, asterisks, bullets, or quotes around the reply.
- No em dashes. Use a comma, colon, or period.
- Only use ids that appear in the context, and only inside tool calls. Never write raw ids in the answer text.
- In your answer, name categories, sectors, documents, and targets by their human-readable name only. Never include the raw id alongside the name (for example, write "Biodiversity awareness and knowledge", not "Biodiversity awareness and knowledge, globe_2"). The Show me button carries the id; the reply is for humans.
- No follow-up questions.
- No value judgements or extended narrative analysis. Hedged process pointers (boundary review, coordination, indicator alignment, sequencing) are allowed when the user asks how coherence could be improved and the pointers reference visible evidence.
- Use the precomputed rankings for aggregate questions; do not guess.
- If you select / focus on a hidden doc's target, you MUST emit show_docs first.
- Do not call a category "underfunded" or "overfunded" without qualification. Describe the observed shares; let the user draw the verdict.`;

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
        "Select a single target from the target index. Opens the target's detail panel which lists all its alignments and flagged misalignments and lets the user click any pair to read its rationale.",
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
  {
    type: "function",
    function: {
      name: "show_docs",
      description:
        "Unhide one or more documents (groups) so the next action's target is visible. Only use when the user named a doc that is currently hidden but appears in the available groups list. Run BEFORE focus_category / select_target / select_pair so the reveal happens first.",
      parameters: {
        type: "object",
        properties: {
          ids: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
          },
        },
        required: ["ids"],
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

/** Tokenise a string into lowercase words ≥3 chars, dropping common stop-ish
 *  fragments that would inflate score noise without carrying topic signal. */
function tokenizeForTopic(text: string): string[] {
  const STOP = new Set([
    "the", "and", "for", "with", "from", "into", "that", "this", "these", "those",
    "are", "was", "were", "has", "have", "had", "can", "may", "will", "would",
    "should", "what", "which", "where", "when", "how", "why", "who", "any",
    "all", "most", "more", "less", "than", "then", "but", "not", "their", "they",
    "its", "out", "over", "under", "between", "across", "through", "throughout",
    "target", "targets", "policy", "policies", "document", "documents",
    // Keyword intent list. Keep legacy "tension"/"contradiction" words so
    // users who learned the old vocabulary still trigger intent matches; the
    // newer "misalignment" synonyms cover the renamed vocabulary.
    "contested", "tension", "tensions", "conflict", "conflicts", "contradiction",
    "contradictions", "misalignment", "misalignments", "misaligned",
    "aligned", "alignment", "alignments", "relate", "related",
    "relates", "relating",
  ]);
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

interface TopicMatch {
  taxonomy: "globe" | "sector" | "adaptation";
  categoryId: string;
  categoryLabel: string;
  score: number;
}

/**
 * Find the taxonomy category that best matches the user's query topic. We
 * score by token overlap between the query and the category's name +
 * description. Returns null if nothing scores above the floor.
 *
 * This is the server-side substitute for asking gpt-4o-mini to do free-form
 * "topic → category" mapping itself, which it does badly without explicit
 * worked examples for every term.
 */
function findTopicCategory(query: string, ctx: ChatContext): TopicMatch | null {
  const tax = ctx.taxonomies;
  if (!tax) return null;
  const qTokens = new Set(tokenizeForTopic(query));
  if (qTokens.size === 0) return null;

  let best: TopicMatch | null = null;
  const consider = (
    taxonomy: TopicMatch["taxonomy"],
    id: string,
    name: string,
    description: string | undefined,
  ) => {
    const nameTokens = tokenizeForTopic(name);
    const descTokens = tokenizeForTopic(description ?? "");
    let score = 0;
    for (const t of nameTokens) if (qTokens.has(t)) score += 3; // name match weighted higher
    for (const t of descTokens) if (qTokens.has(t)) score += 1;
    if (score > 0 && (!best || score > best.score)) {
      best = { taxonomy, categoryId: id, categoryLabel: name, score };
    }
  };
  for (const c of tax.globe) consider("globe", c.id, c.name, c.description);
  for (const c of tax.sector) consider("sector", c.id, c.name, c.description);
  for (const g of tax.adaptation) consider("adaptation", g.id, g.description, undefined);
  return best;
}

/**
 * Build the topic-scoped rankings: targets whose primary classification
 * matches `topic`, ordered by contradiction count then alignment count.
 */
function buildTopicRankings(
  topic: TopicMatch,
  ctx: ChatContext,
): { byTension: { id: string; label: string; count: number }[]; byAlignment: { id: string; label: string; count: number }[] } | null {
  const matchingTargets = ctx.targetIndex.filter((t) => {
    if (topic.taxonomy === "globe") return t.primaryGlobe?.id === topic.categoryId;
    if (topic.taxonomy === "sector") return t.primarySector?.id === topic.categoryId;
    return t.primaryAdaptationGoal?.id === topic.categoryId;
  });
  if (matchingTargets.length === 0) return null;
  const matchingIds = new Set(matchingTargets.map((t) => t.id));
  const tension = new Map<string, number>();
  const alignment = new Map<string, number>();
  // v2.1: single flagged state replaces three v1 severity levels. Legacy
  // strings included for safety while old records may still flow through.
  const CONTRA = new Set(["flagged", "likely_conflict", "possible_conflict", "possible_misalignment"]);
  const STRONG_ALIGN = new Set(["high"]);
  for (const p of ctx.pairs ?? []) {
    if (CONTRA.has(p.level)) {
      if (matchingIds.has(p.a)) tension.set(p.a, (tension.get(p.a) ?? 0) + 1);
      if (matchingIds.has(p.b)) tension.set(p.b, (tension.get(p.b) ?? 0) + 1);
    } else if (STRONG_ALIGN.has(p.level)) {
      if (matchingIds.has(p.a)) alignment.set(p.a, (alignment.get(p.a) ?? 0) + 1);
      if (matchingIds.has(p.b)) alignment.set(p.b, (alignment.get(p.b) ?? 0) + 1);
    }
  }
  const labelFor = (id: string) => {
    const t = ctx.targetIndex.find((tt) => tt.id === id);
    return t ? `${t.sourceDocument}: ${t.sourceLabel}` : id;
  };
  // Targets with zero contradictions still surface so the model can answer
  // "no tensions on file" honestly when the matching set is non-empty but
  // contradiction-free.
  const allMatchingScored = matchingTargets.map((t) => ({
    id: t.id,
    label: labelFor(t.id),
    count: tension.get(t.id) ?? 0,
  }));
  const byTension = allMatchingScored.sort((a, b) => b.count - a.count).slice(0, 5);
  const byAlignment = matchingTargets
    .map((t) => ({ id: t.id, label: labelFor(t.id), count: alignment.get(t.id) ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  return { byTension, byAlignment };
}

function buildUserMessage(
  query: string,
  ctx: ChatContext,
  history?: HistoryTurn[],
): string {
  const groups = ctx.groups.map((g) => `${g.id} | ${g.label}`).join("\n");
  const targets = ctx.targetIndex
    .map((t) => {
      const text = (t.text ?? "").replace(/\s+/g, " ").trim();
      const flags: string[] = [];
      if (t.actionType) flags.push(t.actionType);
      if (t.isQuantitative) flags.push("quantitative");
      if (t.isTimeBound) flags.push("time-bound");
      const flagStr = flags.length ? ` [${flags.join(", ")}]` : "";
      const tags: string[] = [];
      if (t.primaryGlobe) tags.push(`globe=${t.primaryGlobe.id}:${t.primaryGlobe.name}`);
      if (t.primarySector) tags.push(`sector=${t.primarySector.id}:${t.primarySector.name}`);
      if (t.primaryAdaptationGoal)
        tags.push(`adaptation=${t.primaryAdaptationGoal.id}:${t.primaryAdaptationGoal.description.slice(0, 80)}`);
      const tagStr = tags.length ? `\n  primary: ${tags.join(" | ")}` : "";
      return `${t.id} | ${t.sourceDocument}: ${t.sourceLabel}${flagStr}\n  text: ${text}${tagStr}`;
    })
    .join("\n");

  const tax = ctx.taxonomies;
  const taxonomyBlock = tax
    ? [
        tax.globe.length
          ? `GLOBE biodiversity categories (taxonomyType=globe):\n${tax.globe
              .map(
                (c) =>
                  `${c.id} | ${c.name}${c.description ? ` — ${c.description.replace(/\s+/g, " ").slice(0, 200)}` : ""}`,
              )
              .join("\n")}`
          : "",
        tax.sector.length
          ? `IPCC mitigation sectors (taxonomyType=sector):\n${tax.sector
              .map(
                (c) =>
                  `${c.id} | ${c.name}${c.description ? ` — ${c.description.replace(/\s+/g, " ").slice(0, 200)}` : ""}`,
              )
              .join("\n")}`
          : "",
        tax.adaptation.length
          ? `Adaptation goals (taxonomyType=adaptation_goal):\n${tax.adaptation
              .map((g) => `${g.id} | ${g.description.replace(/\s+/g, " ").slice(0, 200)}`)
              .join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";

  // Pair rationales: contradictions first (most diagnostic), then alignments.
  // Severity-ordered so model can scan top-down for concrete tensions.
  const SEVERITY: Record<string, number> = {
    // v2.1: all flagged pairs sort to the top; sub-fields (manageability,
    // confidence) carry the finer ordering once we surface them here.
    flagged: 0,
    // Legacy v1 levels kept for any record that has not yet been migrated.
    likely_conflict: 0,
    possible_conflict: 1,
    possible_misalignment: 2,
    high: 3,
    medium: 4,
    low: 5,
  };
  const pairs = (ctx.pairs ?? [])
    .slice()
    .sort((p, q) => (SEVERITY[p.level] ?? 99) - (SEVERITY[q.level] ?? 99));
  const pairBlock = pairs.length
    ? pairs
        .map((p) => {
          const subs = [p.mechanism, p.manageability, p.confidence && `conf:${p.confidence}`]
            .filter(Boolean)
            .join(", ");
          const ct = subs ? ` (${subs})` : "";
          const r = p.rationale.replace(/\s+/g, " ").trim();
          return `${p.a} ↔ ${p.b} | ${p.level}${ct} | ${r}`;
        })
        .join("\n")
    : "";

  // Always full-corpus rankings. Strict/current-view scoping was removed
  // because it forced users to manage their visible-doc state before they
  // could ask a useful question.
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

  // The DATA block has been server-side filtered to the visible documents.
  // The model's answer should reflect that subset only. When the user has
  // hidden documents, that's intent to focus, not noise to compensate for.
  const scopeHeader =
    "Scope of this turn: every target, pair, and ranking below has been filtered to the documents the user currently has visible on the wheel. Reason and answer over this subset only.";

  // Per-country document gloss with full names, built from the country
  // config so the system prompt can stay country-agnostic. Only documents
  // currently in the corpus are listed; BTR gets a parenthetical because
  // its plans-vs-reported distinction is load-bearing for the answer.
  const docGloss = (ctx.documentTypes ?? []).length
    ? (ctx.documentTypes ?? [])
        .map((dt) => {
          const note =
            dt.id === "BTR" ? " (reported actions, not plans)" : "";
          return `- ${dt.id} | ${dt.fullLabel}${note}`;
        })
        .join("\n")
    : groups; // Fallback: short labels from groups list.

  const docGlossHeader = (ctx.documentTypes ?? []).length
    ? "DOCUMENTS IN THIS CORPUS (id | full name), expand on first mention if the user is unlikely to know the abbreviation:"
    : "Available groups (id | label):";

  // View state and data are separated so the user's current filter / mode
  // doesn't bleed into the model's reasoning over the corpus. View state is
  // for picking the right Show-me action.
  const sections: string[] = [
    "USER'S CURRENT VIEW (for navigation and Show-me targeting only, do NOT let this filter or bias your reasoning over the dataset):",
    `Country: ${ctx.country ?? "Unknown"}`,
    `Current mode: ${ctx.mode}`,
    `Current filter: ${ctx.filter}`,
    `Visible groups right now: ${(ctx.visibleDocs ?? []).join(", ") || "(none, all hidden)"}`,
    "",
    "DATA (reason and answer from here):",
    scopeHeader,
    "",
    docGlossHeader,
    docGloss || "(none)",
    "",
  ];
  if (taxonomyBlock) {
    sections.push(
      "Taxonomies — use these to map free-text topics from the user (e.g. 'pollution', 'restoration', 'energy') to a concrete category id, then look up which targets carry that primary tag:",
      taxonomyBlock,
      "",
    );
  }

  // Server-side topic resolution. If the query maps to a taxonomy category,
  // pre-compute the topic-scoped ranking so the model doesn't need to
  // chain "match topic → filter targets → count pairs" itself.
  const topic = findTopicCategory(query, ctx);
  const topicRankings = topic ? buildTopicRankings(topic, ctx) : null;
  if (topic && topicRankings) {
    const modeLabel =
      topic.taxonomy === "globe"
        ? "globe"
        : topic.taxonomy === "sector"
          ? "sector"
          : "document";
    const lines = [
      `Detected topic: "${topic.categoryLabel}" (${topic.taxonomy} category id=${topic.categoryId}).`,
      `Suggested mode for this topic: ${modeLabel}.`,
      fmtRanking(
        `Topic-scoped: top targets in "${topic.categoryLabel}" by tensions`,
        topicRankings.byTension,
      ),
      fmtRanking(
        `Topic-scoped: top targets in "${topic.categoryLabel}" by strong alignments`,
        topicRankings.byAlignment,
      ),
    ]
      .filter(Boolean)
      .join("\n");
    sections.push(
      "Topic resolution — the user's question matches a taxonomy category. Use these rankings directly; do NOT re-derive the answer from raw target text:",
      lines,
      "",
    );
  }

  if (rankings) {
    sections.push("Pre-computed rankings — use these to pick groups/targets for aggregate questions:", rankings);
  }

  // Precomputed synthesis: corpus storylines + per-doc-pair and per-theme
  // narratives the pipeline derived from the same pairs. Gives the model a
  // ready big-picture answer for "main storyline" / "how do X and Y relate"
  // without re-deriving it from raw pairs. AI-generated, so the system prompt
  // tells the model to keep it hedged.
  const syn = ctx.synthesis;
  if (syn && (syn.corpus || syn.docPairs?.length || syn.sectors?.length)) {
    const parts: string[] = [];
    if (syn.corpus) {
      if (syn.corpus.summary) parts.push(`Corpus summary: ${syn.corpus.summary}`);
      if (syn.corpus.storylines.length) {
        parts.push(
          "Storylines across the corpus (name | type | description):\n" +
            syn.corpus.storylines
              .map((s) => `- ${s.name} | ${s.type} | ${s.description}`)
              .join("\n"),
        );
      }
    }
    if (syn.docPairs && syn.docPairs.length) {
      parts.push(
        "Document-pair syntheses (how two documents align or potentially misalign, with a coordination pointer):\n" +
          syn.docPairs
            .map(
              (d) =>
                `- ${d.a} & ${d.b}: ${d.storyline}. Strong alignment: ${d.reinforce} Potential misalignment: ${d.clash} Coordination: ${d.coordination}`,
            )
            .join("\n"),
      );
    }
    if (syn.sectors && syn.sectors.length) {
      parts.push(
        "Theme syntheses (per sector/category):\n" +
          syn.sectors
            .map(
              (s) =>
                `- ${s.category}. Strong alignment: ${s.reinforce} Potential misalignment: ${s.clash} Coordination: ${s.coordination}`,
            )
            .join("\n"),
      );
    }
    if (parts.length) {
      sections.push(
        "PRECOMPUTED SYNTHESIS — AI-generated storylines and summaries the pipeline derived from the same pairs. Use for big-picture questions (main storyline, how two documents relate, a theme's potential misalignment). Keep the hedged, neutral framing; these are AI-generated, not ground truth:",
        parts.join("\n\n"),
        "",
      );
    }
  }

  // Budget rollup: one line per primary GLOBE category. Plain text, pipe-
  // delimited so the model can quote a number without hallucinating one. Sent
  // unconditionally when the data exists, not gated by the wheel's overlay.
  if (ctx.budgetByCategory && ctx.budgetByCategory.length > 0 && ctx.budgetMeta) {
    const meta = ctx.budgetMeta;
    const periodLabel = `${meta.period.start}-${meta.period.end}`;
    const unitLabel = meta.unit ? `${meta.unit} ${meta.currency}` : meta.currency;
    const lines = ctx.budgetByCategory
      .slice()
      .sort((a, b) => b.shareOfTotalBudget - a.shareOfTotalBudget)
      .map((b) => {
        const sharePct = (b.shareOfTotalBudget * 100).toFixed(1);
        const tSharePct = (b.shareOfTargets * 100).toFixed(1);
        return `${b.categoryId} | ${b.categoryName} | ${b.totalBudget.toFixed(2)} ${unitLabel} | ${sharePct}% of tagged BER | ${b.targetCount} targets (${tSharePct}% of GLOBE-tagged) | ${b.contradictionPairCount} potentially misaligned pairs`;
      })
      .join("\n");
    sections.push(
      `BUDGET BY GLOBE CATEGORY (tagged BER spend, ${periodLabel}, ${unitLabel}; total tagged ${meta.totalBudget.toFixed(2)} ${unitLabel} which is a subset of national expenditure). Format: id | name | total | share of tagged BER | target count (share of GLOBE-tagged targets) | flagged conflict pairs:`,
      lines,
      "",
    );
  }

  sections.push(
    `Available targets — ${ctx.targetIndex.length} total. Format: id | doc: label [flags]\\n  text: <full target text>\\n  primary: <taxonomy tags>:`,
    targets || "(none)",
    "",
  );
  if (pairBlock) {
    sections.push(
      `Pair rationales (${pairs.length} non-"none" pairs, severity-sorted). Format: targetA ↔ targetB | level (mechanism, manageability, conf:level?) | rationale. Use these to answer "why does X conflict with Y" or to surface specific flagged misalignments:`,
      pairBlock,
      "",
    );
  }
  // Conversation context hint: tells the model how to resolve referring
  // expressions ("it", "what about X") against the prior turn. The history
  // turns themselves are also passed as messages, but the hint sharpens the
  // resolution under temperature=0.2 where the model otherwise plays it safe.
  if (history && history.length > 0) {
    const lastUser = [...history].reverse().find((h) => h.role === "user");
    const lastAssistant = [...history]
      .reverse()
      .find((h) => h.role === "assistant");
    if (lastUser || lastAssistant) {
      const parts: string[] = [];
      if (lastUser) parts.push(`previous question: "${lastUser.content}"`);
      if (lastAssistant)
        parts.push(`previous reply: "${lastAssistant.content}"`);
      sections.push(
        `Conversation context: the user is following up on the prior turn. ${parts.join(
          "; ",
        )}. Resolve referring expressions like 'it', 'this', 'these', or 'what about X' from that context. Do not ask for clarification.`,
        "",
      );
    }
  }
  sections.push(`User question: ${query}`);
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
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

async function callAzure(messages: ChatMessage[]): Promise<LlmResponse> {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/$/, "");
  const apiKey = process.env.AZURE_OPENAI_API_KEY ?? "";
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21";
  const deployment = process.env.LLM_CHAT_MODEL ?? process.env.LLM_MODEL ?? "gpt-4o-mini";
  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  // Azure deployments enforce per-minute token quotas (TPM). With a ~50K-token
  // context, a back-to-back chat call can exceed quota and return 429. The
  // suggested wait is in `retry-after` (seconds) or `retry-after-ms`. Try
  // twice with the server's hint (capped to 6s) before failing.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
    if (res.ok) return res.json() as Promise<LlmResponse>;
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryMs = Number(res.headers.get("retry-after-ms"));
      const retrySec = Number(res.headers.get("retry-after"));
      const waitMs = Math.min(
        Number.isFinite(retryMs) && retryMs > 0
          ? retryMs
          : Number.isFinite(retrySec) && retrySec > 0
            ? retrySec * 1000
            : 1500 * attempt,
        6000,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    const text = await res.text();
    throw new Error(`Azure call failed (${res.status}): ${text.slice(0, 500)}`);
  }
  // Unreachable — the loop either returns or throws.
  throw new Error("Azure call failed: exhausted retries");
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

// ─── Answer synthesiser ─────────────────────────────────────────────
//
// gpt-5 deployments often emit tool calls without writing message content
// (the model treats "I picked a tool" as the response). This synthesiser
// turns the tool calls plus the context block into a substantive 2-3
// sentence factual answer, so the chat bubble is never just a one-liner
// like "Opened X ↔ Y." The numbers it quotes come from the context, so
// it can't hallucinate.

const SEVERITY_LABEL: Record<string, string> = {
  flagged: "potential misalignment",
  // Legacy strings retained so any unmigrated v1 record still renders.
  likely_conflict: "likely conflict",
  possible_conflict: "possible conflict",
  possible_misalignment: "possible misalignment",
  high: "high alignment",
  medium: "medium alignment",
  low: "partial alignment",
};

function targetLabel(
  id: string,
  ctx: ChatContext,
): { full: string; doc: string; sourceLabel: string } | null {
  const t = ctx.targetIndex.find((tt) => tt.id === id);
  if (!t) return null;
  return {
    full: `${t.sourceDocument} ${t.sourceLabel}`,
    doc: t.sourceDocument,
    sourceLabel: t.sourceLabel,
  };
}

function synthesizeAnswer(
  actions: ChatAction[],
  ctx: ChatContext,
): string {
  const sentences: string[] = [];

  const selectPair = actions.find(
    (a): a is { type: "select_pair"; targetAId: string; targetBId: string } =>
      a.type === "select_pair",
  );
  const selectTarget = actions.find(
    (a): a is { type: "select_target"; targetId: string } =>
      a.type === "select_target",
  );
  const focusCategory = actions.find(
    (a): a is { type: "focus_category"; categoryId: string } =>
      a.type === "focus_category",
  );

  if (selectPair) {
    const tA = targetLabel(selectPair.targetAId, ctx);
    const tB = targetLabel(selectPair.targetBId, ctx);
    const pair = (ctx.pairs ?? []).find(
      (p) =>
        (p.a === selectPair.targetAId && p.b === selectPair.targetBId) ||
        (p.a === selectPair.targetBId && p.b === selectPair.targetAId),
    );
    if (tA && tB && pair) {
      const sevLabel = SEVERITY_LABEL[pair.level] ?? pair.level;
      const isBtrPair = tA.doc === "BTR" || tB.doc === "BTR";
      // BTR-versus-policy gets sharper framing: it's a reported action
      // conflicting with a stated plan, not two plans on paper.
      if (isBtrPair) {
        const btrSide = tA.doc === "BTR" ? tA : tB;
        const policySide = tA.doc === "BTR" ? tB : tA;
        sentences.push(
          `Sharpest reported action versus plan tension: BTR ${btrSide.sourceLabel} versus ${policySide.full} (${sevLabel}).`,
        );
        // Count of similar BTR-versus-policy pairs in the data.
        const btrPolicyPairs = (ctx.pairs ?? []).filter((p) => {
          const pA = targetLabel(p.a, ctx);
          const pB = targetLabel(p.b, ctx);
          if (!pA || !pB) return false;
          const oneIsBtr = pA.doc === "BTR" || pB.doc === "BTR";
          const bothBtr = pA.doc === "BTR" && pB.doc === "BTR";
          if (!oneIsBtr || bothBtr) return false;
          return (
            p.level === "flagged" ||
            p.level === "likely_conflict" ||
            p.level === "possible_conflict" ||
            p.level === "possible_misalignment"
          );
        });
        if (btrPolicyPairs.length > 1) {
          sentences.push(
            `${btrPolicyPairs.length} reported actions in total contradict policy targets in this dataset.`,
          );
        }
      } else {
        sentences.push(`${tA.full} versus ${tB.full} (${sevLabel}).`);
      }
    } else if (tA && tB) {
      sentences.push(`${tA.full} versus ${tB.full}.`);
    }
  } else if (selectTarget) {
    const t = targetLabel(selectTarget.targetId, ctx);
    if (t) {
      const tensionRank = ctx.rankings?.topTargetsByTension.find(
        (r) => r.id === selectTarget.targetId,
      );
      const alignRank = ctx.rankings?.topTargetsByAlignment.find(
        (r) => r.id === selectTarget.targetId,
      );
      sentences.push(`${t.full} is the focal target.`);
      if (tensionRank || alignRank) {
        const parts: string[] = [];
        if (tensionRank) parts.push(`${tensionRank.count} flagged misalignments`);
        if (alignRank) parts.push(`${alignRank.count} strong alignments`);
        sentences.push(`Carries ${parts.join(" and ")} in the dataset.`);
      }
    }
  } else if (focusCategory) {
    const group = ctx.groups.find((g) => g.id === focusCategory.categoryId);
    if (group) {
      const tensionRank = ctx.rankings?.topGroupsByTension.find(
        (r) => r.id === focusCategory.categoryId,
      );
      const alignRank = ctx.rankings?.topGroupsByAlignment.find(
        (r) => r.id === focusCategory.categoryId,
      );
      if (tensionRank && tensionRank.count > 0) {
        sentences.push(
          `${group.label} carries ${tensionRank.count} tensions in the dataset.`,
        );
      } else {
        sentences.push(`Focused on ${group.label}.`);
      }
      if (alignRank && alignRank.count > 0) {
        sentences.push(
          `Also anchors ${alignRank.count} strong alignments with other documents.`,
        );
      }
    }
  }

  if (sentences.length === 0) {
    // Fall back to a description of the navigation alone (set_filter,
    // set_mode, show_docs only).
    const parts: string[] = [];
    for (const a of actions) {
      if (a.type === "set_filter") {
        parts.push(`Filter set to ${a.filter.replace("_", " + ")}.`);
      } else if (a.type === "set_mode") {
        const labels: Record<string, string> = {
          document: "by document type",
          globe: "by biodiversity category",
          sector: "by climate mitigation sector",
        };
        parts.push(`Grouped ${labels[a.mode]}.`);
      } else if (a.type === "show_docs") {
        parts.push(`Revealed ${a.ids.join(", ")}.`);
      }
    }
    return parts.join(" ");
  }
  // NOTE: only the first select_pair / select_target / focus_category of each
  // kind is consumed. The server pre-sorts and validates actions, so multiples
  // are rare in practice; if the model ever emits two pair calls, only the
  // first one shapes the synthesised reply.
  return sentences.join(" ");
}

// ─── Content-without-actions rescue ─────────────────────────────────
//
// synthesizeAnswer covers the common gpt-5 failure mode (tool calls but no
// content). The inverse failure also happens: the model writes a substantive
// answer naming "BTR X versus FSS Y" but skips select_pair, leaving the Show
// me button hidden. Parse named targets out of the answer text and return
// them in order of appearance so the first two can drive a select_pair
// injection. Matches the same three phrasings the entity extractor uses
// ("<doc> <label>", "<doc>: <label>", and the raw id) so the rescue stays
// in lockstep with what the inline chips can detect.
function extractTargetMentionsFromContent(
  content: string,
  ctx: ChatContext,
): string[] {
  const norm = content.replace(/\s+/g, " ");
  const found: { id: string; pos: number }[] = [];
  for (const t of ctx.targetIndex) {
    if (!t.id) continue;
    const phrases = [t.id];
    if (t.sourceDocument && t.sourceLabel) {
      phrases.push(`${t.sourceDocument} ${t.sourceLabel}`);
      phrases.push(`${t.sourceDocument}: ${t.sourceLabel}`);
    }
    let bestPos = -1;
    for (const phrase of phrases) {
      // Word-bounded substring match: the char immediately after the phrase
      // must be end-of-string or non-label-continuation. ".", "0-9",
      // "A-Za-z" and "_" count as continuation so "NDC 1" does not falsely
      // match "NDC 1.2" and "FSS_29" does not match "FSS_290".
      let from = 0;
      while (from <= norm.length) {
        const pos = norm.indexOf(phrase, from);
        if (pos === -1) break;
        const next = norm[pos + phrase.length];
        if (next === undefined || !/[A-Za-z0-9_.]/.test(next)) {
          if (bestPos === -1 || pos < bestPos) bestPos = pos;
          break;
        }
        from = pos + 1;
      }
    }
    if (bestPos !== -1) found.push({ id: t.id, pos: bestPos });
  }
  return found.sort((x, y) => x.pos - y.pos).map((x) => x.id);
}

// ─── Inline target-id entities for the chat reply ───────────────────
//
// The client renders the reply text and turns each entity span into a
// clickable button that selects the target. Distinct from the Show-me
// rescue above: this one matches raw `target.id` substrings (e.g.
// "FSS_29", "BTR_9") rather than "<doc> <label>" phrases, and returns
// every occurrence with start/end byte offsets. Word-bounded so
// "FSS_29" does not falsely match "FSS_290" or "XFSS_29Y".
interface ReplyEntity {
  type: "target";
  id: string;
  start: number;
  end: number;
}

function extractTargetIdEntities(
  content: string,
  ctx: ChatContext,
): ReplyEntity[] {
  const entities: ReplyEntity[] = [];
  // Build candidate phrases per target. The model alternates between
  // the raw id ("FSS_29"), the doc+space+label form ("FSS 29"), and the
  // doc+colon+label form ("FSS: 29") depending on phrasing. We match all
  // three so an inline chip lands no matter which form the model picked.
  // Phrases are tried in length-descending order so the longest match at
  // each position wins, preventing "FSS 29" from being shadowed by a
  // shorter same-position match.
  type Candidate = { id: string; phrase: string };
  const candidates: Candidate[] = [];
  for (const t of ctx.targetIndex) {
    if (typeof t.id !== "string" || t.id.length === 0) continue;
    candidates.push({ id: t.id, phrase: t.id });
    if (t.sourceDocument && t.sourceLabel) {
      candidates.push({
        id: t.id,
        phrase: `${t.sourceDocument} ${t.sourceLabel}`,
      });
      candidates.push({
        id: t.id,
        phrase: `${t.sourceDocument}: ${t.sourceLabel}`,
      });
    }
  }
  candidates.sort((a, b) => b.phrase.length - a.phrase.length);

  const taken: Array<[number, number]> = [];
  for (const { id, phrase } of candidates) {
    let from = 0;
    while (from <= content.length) {
      const pos = content.indexOf(phrase, from);
      if (pos === -1) break;
      const prev = content[pos - 1];
      const next = content[pos + phrase.length];
      // Boundary char set covers id continuations ("FSS_29" not into
      // "FSS_290") and label continuations ("FSS 29" not into "FSS 29.1").
      const prevOk = prev === undefined || !/[A-Za-z0-9_]/.test(prev);
      const nextOk = next === undefined || !/[A-Za-z0-9_.]/.test(next);
      if (prevOk && nextOk) {
        const end = pos + phrase.length;
        const conflict = taken.some(([s, e]) => pos < e && s < end);
        if (!conflict) {
          entities.push({ type: "target", id, start: pos, end });
          taken.push([pos, end]);
        }
      }
      from = pos + 1;
    }
  }
  entities.sort((a, b) => a.start - b.start);
  return entities;
}

// ─── Action ordering for the client ─────────────────────────────────
//
// set_mode resets the selection state on the client, so it must run before
// focus/select. set_filter is independent. The server pre-sorts so the
// client can apply blindly.
const ACTION_ORDER: Record<ChatAction["type"], number> = {
  // show_docs must run first: unhiding has to happen before any focus or
  // selection lands on a target whose doc was hidden.
  show_docs: 0,
  set_mode: 1,
  set_filter: 2,
  focus_category: 3,
  select_target: 4,
  select_pair: 5,
  noop: 6,
};

export async function POST(req: Request) {
  let body: {
    query?: string;
    context?: ChatContext;
    history?: HistoryTurn[];
  };
  try {
    body = (await req.json()) as {
      query?: string;
      context?: ChatContext;
      history?: HistoryTurn[];
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const query = (body.query ?? "").trim();
  const context = body.context;
  const history = (body.history ?? []).slice(-3); // cap at 3 turns
  if (!query) {
    return NextResponse.json({ error: "Empty query" }, { status: 400 });
  }
  if (!context) {
    return NextResponse.json({ error: "Missing context" }, { status: 400 });
  }

  // Empty visible-docs short circuit: when the user has hidden every
  // document on the wheel, there's literally nothing for the chat to reason
  // over. Skip the LLM round-trip and return a self-explanatory reply that
  // tells the user to toggle a document back on. Cheaper, faster, and
  // prevents a confused gpt-5 answer.
  if (context.targetIndex.length === 0) {
    return NextResponse.json({
      reply:
        "All documents are currently hidden on the wheel. Toggle at least one document back on to ask questions about its targets.",
      actions: [],
      suggestions: [
        {
          label: "Show all documents",
          query: "Show all documents",
          kind: "surprise" as const,
        },
      ],
      replyEntities: [],
    });
  }

  // Auto-broaden is decided client-side: when the user's query mentions a
  // doc id that's currently hidden, the client flips searchAllDocs to true
  // for that turn (mirroring the explicit toggle path). The server therefore
  // sees scope=all_documents and can emit show_docs to reveal the doc before
  // the rest of the actions land. The user never sees "toggle a setting".

  // Conversation memory: a single short hint line at the head of the user
  // message tells the model how to resolve referring expressions against the
  // prior turn. The history itself is also passed as messages so gpt can
  // reference it directly.
  const userMessage = buildUserMessage(query, context, history);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((h) => ({ role: h.role, content: h.content }) as ChatMessage),
    { role: "user", content: userMessage },
  ];

  let response: LlmResponse;
  const llmStart = Date.now();
  try {
    response = await callLlm(messages);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "LLM call failed" },
      { status: 502 },
    );
  }
  const llmLatencyS = (Date.now() - llmStart) / 1000;

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
    } else if (fnName === "show_docs") {
      const raw = Array.isArray(args.ids) ? (args.ids as unknown[]) : [];
      const ids = raw
        .map((x) => String(x ?? ""))
        .filter((id) => groupIds.has(id));
      if (ids.length > 0) {
        actionByType.set("show_docs", { type: "show_docs", ids });
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

  // Show me reliability fallback: when the model emitted show_docs but no
  // focus/select to land on, Show me would just unhide a doc and stop —
  // which reads as nothing happened. Promote the first revealed doc to a
  // focus action so the wheel actually reshapes. Mirrors the system-prompt
  // hard rule; this block is the safety net when the model still skips it.
  const hasNavAction = finalActions.some(
    (a) =>
      a.type === "select_target" ||
      a.type === "select_pair" ||
      a.type === "focus_category",
  );
  if (!hasNavAction) {
    const showDocs = finalActions.find(
      (a): a is { type: "show_docs"; ids: string[] } =>
        a.type === "show_docs",
    );
    if (showDocs && showDocs.ids.length > 0) {
      const hasSetMode = finalActions.some((a) => a.type === "set_mode");
      if (!hasSetMode) {
        finalActions.push({ type: "set_mode", mode: "document" });
      }
      finalActions.push({
        type: "focus_category",
        categoryId: showDocs.ids[0],
      });
      finalActions.sort((a, b) => ACTION_ORDER[a.type] - ACTION_ORDER[b.type]);
    }

    // Content-without-actions rescue: even after the show_docs promotion the
    // response may still have no nav action. If the model wrote a substantive
    // answer naming specific targets but skipped select_pair / select_target,
    // recover by parsing target mentions out of the text. Mirrors the
    // synthesiser pattern, which handles the opposite failure (tools but no
    // content). Without this, the Show me button stays hidden for the
    // common "X versus Y" answer shape.
    const hasNavAfterShowDocs = finalActions.some(
      (a) =>
        a.type === "select_target" ||
        a.type === "select_pair" ||
        a.type === "focus_category",
    );
    if (!hasNavAfterShowDocs && content) {
      const mentioned = extractTargetMentionsFromContent(content, context);
      if (mentioned.length >= 2) {
        finalActions.push({
          type: "select_pair",
          targetAId: mentioned[0],
          targetBId: mentioned[1],
        });
        finalActions.sort(
          (a, b) => ACTION_ORDER[a.type] - ACTION_ORDER[b.type],
        );
      } else if (mentioned.length === 1) {
        finalActions.push({
          type: "select_target",
          targetId: mentioned[0],
        });
        finalActions.sort(
          (a, b) => ACTION_ORDER[a.type] - ACTION_ORDER[b.type],
        );
      }
    }
  }

  // Prefer the model's content when it wrote one; otherwise synthesise a
  // substantive factual answer from the tool calls + context. Most gpt-5
  // class models tend to either tool-call OR write content, not both, so
  // the synthesiser does the heavy lifting when only tools are present.
  let reply = content;
  if (!reply && finalActions.length > 0) {
    reply = synthesizeAnswer(finalActions, context);
  }
  if (!reply) {
    // Reached when both content and actions are empty. With the answer-first
    // prompt this should be rare, but keep a graceful fallback so the user
    // sees a sentence rather than a blank bubble.
    reply =
      "I don't have a clean answer for that in the current data. Try one of the example questions below or rephrase.";
  }
  // Em dash hygiene: the prompt forbids em dashes, but models occasionally
  // slip one in. Normalise to a comma + space so the rest of the reply stays
  // legible. Same goes for the fallback synthesised reply above when it
  // joined parts with the unicode arrow.
  reply = reply.replace(/—/g, ", ").replace(/\s+,/g, ",");

  const suggestions = buildSuggestions(finalActions, context);
  const replyEntities = extractTargetIdEntities(reply, context);

  // Non-blocking footprint tracking. Only the output token count + model name
  // leave the server (never the prompt or any policy content), honouring the
  // data-sovereignty guardrail. We estimate via the hosted EcoLogits API and
  // append to the shared ledger AFTER building the reply and without awaiting,
  // so chat latency and reliability are never affected. Errors are swallowed.
  const outputTokens = response.usage?.completion_tokens ?? 0;
  if (outputTokens > 0) {
    const model =
      process.env.LLM_CHAT_MODEL ?? process.env.LLM_MODEL ?? "gpt-4o-mini";
    const zone = process.env.CPC_ELECTRICITY_ZONE ?? "USA";
    const promptTokens = response.usage?.prompt_tokens ?? null;
    void estimateChatImpacts({ model, outputTokens, latencyS: llmLatencyS, zone })
      .then((impacts) =>
        appendEvent({
          component: "chat",
          provider: "openai",
          model,
          region: zone,
          run_id: null,
          country: null,
          input_tokens: promptTokens,
          output_tokens: outputTokens,
          call_count: 1,
          cached_call_count: 0,
          energy_wh: impacts.energy_wh,
          water_ml: impacts.water_ml,
          co2_geq: impacts.co2_geq,
          minerals_ugsbeq: impacts.minerals_ugsbeq,
          source: impacts.source,
        }),
      )
      .catch(() => {});
  }

  return NextResponse.json({
    reply,
    actions: finalActions,
    suggestions,
    replyEntities,
  });
}

/**
 * Generate 2-3 follow-up chip questions derived deterministically from the
 * resulting view state. Stays out of the LLM path so chips render instantly
 * and don't add latency. Each chip is a free-text query the user can submit
 * back into the chat; clicking it triggers the normal POST flow.
 */
function buildSuggestions(
  actions: ChatAction[],
  ctx: ChatContext,
): { label: string; query: string; kind?: "surprise" }[] {
  const out: { label: string; query: string; kind?: "surprise" }[] = [];
  const seen = new Set<string>();
  const add = (label: string, query: string, kind?: "surprise") => {
    if (seen.has(query) || out.length >= 3) return;
    seen.add(query);
    out.push({ label, query, ...(kind ? { kind } : {}) });
  };

  const selectTarget = actions.find(
    (a): a is { type: "select_target"; targetId: string } =>
      a.type === "select_target",
  );
  const selectPair = actions.find(
    (a): a is {
      type: "select_pair";
      targetAId: string;
      targetBId: string;
    } => a.type === "select_pair",
  );
  const focusCategory = actions.find(
    (a): a is { type: "focus_category"; categoryId: string } =>
      a.type === "focus_category",
  );

  if (selectPair) {
    add("Find similar tensions", "Find similar tensions elsewhere");
    const tA = ctx.targetIndex.find((t) => t.id === selectPair.targetAId);
    if (tA) {
      add(
        `Show ${tA.sourceLabel}'s other conflicts`,
        `What else does ${tA.sourceDocument} ${tA.sourceLabel} conflict with?`,
      );
    }
  } else if (selectTarget) {
    const t = ctx.targetIndex.find((tt) => tt.id === selectTarget.targetId);
    const label = t ? `${t.sourceDocument} ${t.sourceLabel}` : "this target";
    // Count tensions / alignments involving this target from the pair list.
    let tensionCount = 0;
    let alignCount = 0;
    let topConflictPartner: string | null = null;
    let topConflictLabel: string | null = null;
    for (const p of ctx.pairs ?? []) {
      if (p.a !== selectTarget.targetId && p.b !== selectTarget.targetId)
        continue;
      const partner = p.a === selectTarget.targetId ? p.b : p.a;
      if (
        p.level === "likely_conflict" ||
        p.level === "possible_conflict" ||
        p.level === "possible_misalignment"
      ) {
        tensionCount += 1;
        if (!topConflictPartner) {
          topConflictPartner = partner;
          const pt = ctx.targetIndex.find((x) => x.id === partner);
          if (pt) topConflictLabel = `${pt.sourceDocument} ${pt.sourceLabel}`;
        }
      } else if (p.level === "high") {
        alignCount += 1;
      }
    }
    if (tensionCount > 0) {
      add("Why is this contested?", `Why is ${label} contested?`);
      if (topConflictPartner && topConflictLabel) {
        add(
          `Compare with ${topConflictLabel}`,
          `Why does ${label} conflict with ${topConflictLabel}?`,
        );
      }
    }
    if (alignCount > 0) {
      add(
        "Show its strongest alignments",
        `What does ${label} align strongly with?`,
      );
    }
    add("Surprise me", "Surprise me with something else", "surprise");
  } else if (focusCategory) {
    const group = ctx.groups.find((g) => g.id === focusCategory.categoryId);
    const groupLabel = group?.label ?? focusCategory.categoryId;
    add(
      `Drill into top tension in ${groupLabel}`,
      `Which target in ${groupLabel} is the most contested?`,
    );
    add(
      `Top alignment target in ${groupLabel}`,
      `Which target in ${groupLabel} has the strongest alignments?`,
    );
    add("Surprise me", "Surprise me with something else", "surprise");
  } else {
    add("Try a different angle", "Show me the most contested target across all plans");
    add("Surprise me", "Surprise me with something else", "surprise");
  }

  return out;
}
