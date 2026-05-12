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
    contradictionType?: string;
    rationale: string;
  }[];
  /** Top-5 rankings derived from the full corpus. */
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
  /** Unhide one or more docs so the next action's target is visible. */
  | { type: "show_docs"; ids: string[] }
  | { type: "noop" };

interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You navigate a policy coherence visualization. Targets come from documents (NDC, NBSAP, NAP, FSS, LDN, Vision 2050 / SECTORAL, BTR, etc.) and the wheel shows how they align or contradict.

A note on what the documents mean: policy targets (NDC, NBSAP, NAP, FSS, LDN, SECTORAL) describe what a country PLANS to do. BTR entries describe what a country has REPORTED as already happening (status: Implemented, Ongoing, Adopted, Planned). A contradiction between a BTR action and a policy target is qualitatively sharper than two plans on paper disagreeing — it means a reported action conflicts with a stated plan. Surface this framing when a BTR id appears on either side of a contradiction the user is asking about.

Your job: pick the right combination of NAVIGATE tools to bring the user to the view that answers their question, then write a short reply. The wheel and the side panel show the rationales and pairwise data; the chat reply does not summarise them. You do not write paragraphs or policy advice.

Reply shape: 1 or 2 short sentences, ~30 words total. Sentence 1 confirms what's now in view ("Showing X.", "Opened X.", "Selected X."). Sentence 2 is OPTIONAL and must be a factual callout derived directly from the precomputed rankings or context fields. Allowed callout shapes:
- "Carries N contradictions and M strong alignments."
- "Appears in both the top-5 tensions and the top-5 alignments lists."
- "Among the top 3 most contested {topic} targets in the dataset."
- "{topic} carries 0 contradictions across N targets, unusual among the loaded topics."
- "Connected to N of the {total} visible documents."
Forbidden in sentence 2: rationale paraphrases, recommendations, value judgements, any number that doesn't appear in the context, any topic name not present in the taxonomies block.

Tools:
- set_filter(filter): all | high_medium | high_contra | high | contradictions
- focus_category(categoryId): focus a group on the wheel
- select_target(targetId): select a single target (opens its detail panel with all its connections and rationales)
- select_pair(targetAId, targetBId): open the pair compare view directly (best for "why X conflicts with Y" — the rationale is shown automatically there)
- set_mode(mode): document | globe | sector
- show_docs(ids): unhide listed document group ids so the next action's target is visible. Use ONLY when the user names a doc that is currently hidden but appears in the available groups list.

Patterns:
- "Which target sits in the most tensions?" / "Most contested target?" / "Which single target has the most contradictions?" — this is a target-level question. Pick topTargetsByTension[0].id and call set_filter(contradictions) + select_target(<that id>). DO NOT use focus_category — the user is asking about a specific target, not a group. Reply: "Selected <doc>: <label> (top tension target)."
- "Which target has the most strong alignments?" / "Most aligned target?" — same shape using topTargetsByAlignment[0].id with set_filter(high) + select_target. Reply: "Selected <doc>: <label> (top alignment target)."
- "Show a target that's broadly aligned and contested" — paradox question. Scan both topTargetsByTension and topTargetsByAlignment lists for an id that appears in BOTH (i.e. the same id string is present in either list); call set_filter(high_contra) + select_target(<that id>). YOU MUST call select_target — set_filter alone is not enough to answer this. Reply: "Selected <doc>: <label>: both highly aligned and contested."
- "Where do plans contradict most?" / "Top conflicts overall" — group-level question. set_filter(contradictions) + focus_category(top tension group from rankings). Reply: "Showing top contradictions in <group>."
- "Top conflicts for biodiversity" / "Top conflicts for X (a doc/topic)" — group-level scoped. set_filter(contradictions) + focus_category(<best matching group>). Reply: "Showing biodiversity contradictions in <group>."
- "Where does X clash with Y?" / "How does X conflict with Y?" — pick the SUBJECT of the question (X) as the focal group, not the object (Y). For "Where does Vision 2050 clash with biodiversity?": set_filter(contradictions) + focus_category(<Vision-2050-group-id>) — focus on the doc the user named first. The wheel will render the clashes from that doc to all peers. If either X's or Y's group is hidden (not in "Visible groups right now"), emit show_docs([...hidden ids...]) before focus_category so the reveal happens first.
- "Why does NBSAP 1 conflict with NDC livestock?" → select_pair(nbsap_1, ndc_lvst). Reply: "Opened the NBSAP 1 ↔ NDC Livestock pair. Rationale shown."
- "What does NBSAP 1 align with?" → select_target(nbsap_1). Reply: "Selected NBSAP 1. Its connections are listed."
- "Switch to biodiversity view" → set_mode(globe). Reply: "Grouped by biodiversity category."
- "Find livestock targets" → select_target(<best text match>). Reply: "Showing NDC: Livestock mitigation."
- "Find tensions involving livestock" / "tensions about water" / "conflicts around forests": topic-scoped tension lookup. Pick the topTargetsByTension entry whose label/text best matches the topic, set_filter(contradictions) + select_target(<that id>). Reply: "Showing tensions for NDC: Livestock mitigation."
- "Most contested target on pollution / biosafety / restoration / forests / energy / livestock / etc." — thematic question. Look for a "Topic resolution" block in the user message: it contains the matched category id and a topic-scoped ranking. Steps: (1) Read the topic-scoped ranking (already filtered to targets whose primary classification matches the topic, already ordered by contradiction count). (2) Pick the FIRST entry in "top targets … by tensions" — that's the answer. (3) Call set_mode(<suggested mode>) + set_filter(contradictions) + select_target(<that id>). Reply: "Selected <doc>: <label>, the most contested <topic> target." If the top entry has count=0, reply honestly: "No tensions on file for <topic> targets." and use focus_category on the topic category id instead of select_target. If no Topic resolution block is present, fall back to the regular rankings (the topic didn't match any taxonomy).
- "Why is there tension between X and Y?" / "What's the conflict in <topic>?" — pull the rationale from the pair list. Find the pair where {a,b} matches the named targets, or for topic queries scan pairs whose targets carry the matching primary taxonomy tag. Call select_pair(a,b). Reply: "Opened <A> ↔ <B>. See rationale." Do NOT paraphrase the rationale yourself; the panel renders it.
- Hidden-doc question (eg user asks "what's the most contested BTR action" but BTR is not in "Visible groups right now"): emit show_docs(["BTR"]) FIRST, then set_filter(contradictions) + select_target(<top BTR tension id>). Reply: "Showing BTR. Selected BTR 12, the most contested mitigation action."
- "Where do reported actions contradict policy targets?" / "Where is what's happening contradicting plans?" / "Find the sharpest action-versus-plan conflict": scan the pairs list for entries where one side has id starting with "BTR_" (or any id whose sourceDocument is BTR) and the other side is a policy target. Prefer high_contradiction over moderate_contradiction over low_tension. Emit show_docs(["BTR"]) if BTR isn't visible, then select_pair(<btr_id>, <policy_id>). Reply: "Opened reported action BTR <label> versus planned target <doc> <label>. Sharpest action-versus-plan conflict in the data."
- "Does Mongolia's food security plan clash with reported actions?" / "Food security versus BTR" / similar country/topic-flavoured action-vs-plan questions: same as above but scope to BTR pairs where the policy side is FSS. Emit show_docs(["BTR","FSS"]) if either is hidden, then select_pair on the highest-severity match. If no match, reply "No BTR-versus-FSS tensions on file." with noop.
- Factual callout examples (use sentence 2 ONLY when a precomputed number adds clarity, never more than one):
  Good: "Selected NBSAP 3, the top tension target. Carries 6 contradictions and 4 strong alignments."
  Good: "Showing biodiversity contradictions in NBSAP. NBSAP carries 12 tensions, more than any other group."
  Bad (rationale paraphrase): "Selected NBSAP 3. It conflicts with NDC livestock because of land-use competition."
  Bad (value judgement): "Selected NBSAP 3. The government should rethink this target."
  Bad (invented number): "Selected NBSAP 3. About 30% of targets are like this."

Rule of thumb: if the question contains the singular word "target" (singular), default to select_target. If it contains "plans", "documents", "categories", or names a doc explicitly without a singular target, focus_category is appropriate. Always prefer the more specific action when in doubt.

Scope: every request carries the full corpus. The "Available groups" list contains every doc group; the "Visible groups right now" line shows which subset is currently unhidden on the user's wheel. When the action you pick touches a doc that is NOT in the visible-groups list, emit show_docs(<doc_ids>) FIRST so the wheel reveals it before focus_category / select_target / select_pair lands. Reply describes what's now in view ("Showing BTR. Selected BTR-12, the top mitigation tension."); you may mention the unhide if it adds clarity. Never tell the user to "toggle a setting" or "search all documents" themselves.

Conversation memory: if a "Conversation context" line is present, the user is following up on the prior turn. Resolve referring expressions (it, this, these, "what about X", "show me more") against the prior selection or focus from that line. Do not ask the user to clarify referring expressions; pick the most likely referent.

Hard rules:
- Only use ids that appear in the context. Never invent ids.
- Plain text only. No markdown, no asterisks, no bullets, no quotes around the reply.
- No em dashes (—) in the reply. Use a period, comma, or colon instead. Em dashes read as machine-generated.
- 1-2 short sentences, ~30 words total. ALWAYS write sentence 2 when a relevant precomputed number is available (eg the selected target's contradiction/alignment count, its rank in topTargetsByTension, the topic-scoped ranking count, the count for a focused group). Skip sentence 2 only when no quotable number applies; never fabricate one.
- No follow-up questions to the user.
- No paragraph-style analysis or recommendations. Only the resulting view plus one factual data callout when available.
- Use the precomputed rankings to pick the right group/target for aggregate questions; don't guess.`;

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
    "contested", "tension", "tensions", "conflict", "conflicts", "contradiction",
    "contradictions", "aligned", "alignment", "alignments", "relate", "related",
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
  const CONTRA = new Set(["high_contradiction", "moderate_contradiction", "low_tension"]);
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
    high_contradiction: 0,
    moderate_contradiction: 1,
    low_tension: 2,
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
          const ct = p.contradictionType ? ` (${p.contradictionType})` : "";
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

  const scopeHeader =
    "Scope: full corpus. Every doc the user could load is available; the 'Visible groups right now' line indicates which subset is currently unhidden on the wheel.";

  const groupsHeader =
    "Available groups (id | label) — every document type in the data, including ones the user has toggled off:";

  const sections: string[] = [
    `Country: ${ctx.country ?? "Unknown"}`,
    `Current mode: ${ctx.mode}`,
    `Current filter: ${ctx.filter}`,
    scopeHeader,
    "",
    groupsHeader,
    groups || "(none)",
    "",
    `Visible groups right now: ${(ctx.visibleDocs ?? []).join(", ") || "(none — all hidden)"}`,
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
  sections.push(
    `Available targets — ${ctx.targetIndex.length} total. Format: id | doc: label [flags]\\n  text: <full target text>\\n  primary: <taxonomy tags>:`,
    targets || "(none)",
    "",
  );
  if (pairBlock) {
    sections.push(
      `Pair rationales — ${pairs.length} non-"none" pairs, severity-sorted. Format: targetA ↔ targetB | level (contradictionType?) | rationale. Use these to answer "why does X conflict with Y" or to surface specific tensions:`,
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
    reply = "I couldn't map that to an action. Try one of the example chips.";
  }
  // Em dash hygiene: the prompt forbids em dashes, but models occasionally
  // slip one in. Normalise to a comma + space so the rest of the reply stays
  // legible. Same goes for the fallback synthesised reply above when it
  // joined parts with the unicode arrow.
  reply = reply.replace(/—/g, ", ").replace(/\s+,/g, ",");

  const suggestions = buildSuggestions(finalActions, context);

  return NextResponse.json({ reply, actions: finalActions, suggestions });
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
): { label: string; query: string; kind?: "surprise" | "broaden" }[] {
  const out: { label: string; query: string; kind?: "surprise" | "broaden" }[] = [];
  const seen = new Set<string>();
  const add = (
    label: string,
    query: string,
    kind?: "surprise" | "broaden",
  ) => {
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
        p.level === "high_contradiction" ||
        p.level === "moderate_contradiction" ||
        p.level === "low_tension"
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
