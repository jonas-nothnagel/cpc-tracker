/**
 * Intent-aware, token-budgeted context selection for the coherence chat.
 *
 * Why this exists: the chat used to ship every diagnostic pair (flagged +
 * high) with its rationale to the model on every turn. On a real corpus that
 * is enormous (Mongolia ~2.5K pairs, Panama ~8.7K) and the single request
 * exceeds the Azure deployment's per-minute token quota, so the call 429s
 * deterministically. The chat is answer-first, and answers come from the
 * small precomputed rankings + synthesis (aggregate questions) plus the pair
 * rationales most relevant to the question (specific questions). Dumping all
 * pairs buries the relevant ones and breaks the request; selecting the
 * relevant ones makes answers better AND keeps the prompt small.
 *
 * The design:
 *  1. Detect the scope of the question (named documents, named targets, a
 *     taxonomy topic, or broad).
 *  2. Build a candidate pair set from that scope.
 *  3. Score candidates by relevance and fill a token budget. If the whole
 *     candidate set fits, include all of it at full rationale length (the
 *     "few documents -> more context each" case). If it overflows, take the
 *     top-N by relevance and report that it was capped.
 *  4. Return `meta` so the UI can tell the user, in one line, what the answer
 *     was built from.
 *
 * Everything here is pure and unit-tested. No embeddings: the corpus is small
 * and already tagged, so lexical overlap + taxonomy-tag matching is enough.
 */

import { isContradiction } from "@/types";
import type { AlignmentLevel, AlignmentResult, Target } from "@/types";

/** Token budget for the dynamic context (pairs + per-target full text).
 *  "Generous" tier chosen with the user: ~5x smaller than the old Mongolia
 *  prompt, comfortable headroom under the 250K TPM ceiling, room for many
 *  raw pairs on broad questions. The fixed overhead (system prompt,
 *  taxonomies, lightweight target index, rankings, synthesis) sits on top,
 *  keeping realized prompts around ~120-130K. */
export const CHAT_CONTEXT_TOKEN_BUDGET = 90_000;

/** Rationale length cap (chars) when the candidate set overflows the budget
 *  and we have to ration detail across many pairs. Median rationale is ~492
 *  and p90 ~565, so 600 keeps nearly all of them whole. */
const RATIONALE_CAP_CAPPED = 600;
/** Rationale length cap (chars) when the whole candidate set fits the budget
 *  and we can afford full detail. Generous upper guard against a pathological
 *  rationale, not a real-world trim. */
const RATIONALE_CAP_FULL = 4000;
/** Approx token overhead per rendered pair line (ids, level, mechanism tags,
 *  separators) on top of the rationale itself. */
const PAIR_OVERHEAD_TOKENS = 24;
/** Approx token overhead per full-text target line (id, doc, label, tags)
 *  on top of the target text itself. */
const TARGET_OVERHEAD_TOKENS = 30;

export interface PrimarySlot {
  globe?: { id: string; name: string };
  sector?: { id: string; name: string };
  adaptation?: { id: string; description: string };
}

export interface TopicMatch {
  taxonomy: "globe" | "sector" | "adaptation";
  categoryId: string;
  categoryLabel: string;
  score: number;
}

export interface RankedItem {
  id: string;
  label: string;
  count: number;
}

export type ChatScopeKind = "doc-pair" | "topic" | "target" | "broad";

export interface QueryScope {
  kind: ChatScopeKind;
  /** Document ids named in the query (e.g. "FSS", "NDC"). */
  docIds: string[];
  /** Target ids named in the query (e.g. "FSS_29"). */
  targetIds: string[];
  /** Resolved taxonomy topic, if the query maps to one. */
  topic: TopicMatch | null;
}

export interface ChatContextMeta {
  scopeKind: ChatScopeKind;
  /** Human-readable focus label for the caption. */
  scopeLabel: string;
  /** Candidate pairs the scope produced, before any budget cap. */
  pairsConsidered: number;
  /** Pairs actually sent to the model. */
  pairsIncluded: number;
  /** True when the candidate set was larger than the budget allowed. */
  capped: boolean;
  /** Document ids in focus (doc-pair scope). */
  docsInFocus?: string[];
  /** Topic label (topic scope). */
  topicLabel?: string;
}

export interface SelectedPair {
  a: string;
  b: string;
  level: AlignmentLevel;
  mechanism?: AlignmentResult["mechanism"];
  manageability?: AlignmentResult["manageability"];
  confidence?: AlignmentResult["confidence"];
  rationale: string;
}

/** Estimate token count from character length. The char/4 heuristic is the
 *  standard rough estimate for English text and is plenty accurate for
 *  budgeting; we don't ship a tokenizer dependency for this. */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

const STOP = new Set([
  "the", "and", "for", "with", "from", "into", "that", "this", "these", "those",
  "are", "was", "were", "has", "have", "had", "can", "may", "will", "would",
  "should", "what", "which", "where", "when", "how", "why", "who", "any",
  "all", "most", "more", "less", "than", "then", "but", "not", "their", "they",
  "its", "out", "over", "under", "between", "across", "through", "throughout",
  "target", "targets", "policy", "policies", "document", "documents",
  // Intent keywords carry no topic signal. Keep legacy "tension"/"contradiction"
  // words so users on the old vocabulary still trigger matches; the newer
  // "misalignment" synonyms cover the renamed vocabulary.
  "contested", "tension", "tensions", "conflict", "conflicts", "contradiction",
  "contradictions", "misalignment", "misalignments", "misaligned",
  "aligned", "alignment", "alignments", "relate", "related",
  "relates", "relating",
]);

/** Tokenise into lowercase words >=3 chars, dropping stop-ish fragments that
 *  would inflate score noise without carrying topic signal. Shared by topic
 *  resolution and lexical relevance scoring. */
export function tokenizeForTopic(text: string): string[] {
  return (text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

export interface ChatTaxonomies {
  globe: { id: string; name: string; description?: string }[];
  sector: { id: string; name: string; description?: string }[];
  adaptation: { id: string; description: string }[];
}

/**
 * Find the taxonomy category that best matches the query topic by token
 * overlap against each category's name (weighted) + description. Returns null
 * if nothing scores above zero. Moved here from the chat route so the client
 * selector and the server prompt builder share one implementation.
 */
export function findTopicCategory(
  query: string,
  taxonomies: ChatTaxonomies | undefined,
): TopicMatch | null {
  if (!taxonomies) return null;
  const qTokens = new Set(tokenizeForTopic(query));
  if (qTokens.size === 0) return null;

  let best: TopicMatch | null = null;
  const consider = (
    taxonomy: TopicMatch["taxonomy"],
    id: string,
    name: string,
    description: string | undefined,
  ) => {
    let score = 0;
    for (const t of tokenizeForTopic(name)) if (qTokens.has(t)) score += 3;
    for (const t of tokenizeForTopic(description ?? "")) if (qTokens.has(t)) score += 1;
    if (score > 0 && (!best || score > best.score)) {
      best = { taxonomy, categoryId: id, categoryLabel: name, score };
    }
  };
  for (const c of taxonomies.globe) consider("globe", c.id, c.name, c.description);
  for (const c of taxonomies.sector) consider("sector", c.id, c.name, c.description);
  for (const g of taxonomies.adaptation) consider("adaptation", g.id, g.description, undefined);
  return best;
}

/** True when the char immediately before/after a matched phrase is not an
 *  id/label continuation, so "FSS_29" doesn't match inside "FSS_290" and
 *  "FSS" doesn't match inside "FSSX". */
function isBoundedMatch(haystack: string, phrase: string): boolean {
  let from = 0;
  while (from <= haystack.length) {
    const pos = haystack.indexOf(phrase, from);
    if (pos === -1) return false;
    const prev = haystack[pos - 1];
    const next = haystack[pos + phrase.length];
    const prevOk = prev === undefined || !/[A-Za-z0-9_]/.test(prev);
    const nextOk = next === undefined || !/[A-Za-z0-9_.]/.test(next);
    if (prevOk && nextOk) return true;
    from = pos + 1;
  }
  return false;
}

export interface ScopeInputs {
  documentTypes: { id: string; fullLabel: string }[];
  targets: { id: string; sourceDocument: string; sourceLabel: string }[];
  taxonomies?: ChatTaxonomies;
}

/**
 * Classify the question's scope. Priority: explicitly named targets, then
 * named documents, then a resolved taxonomy topic, else broad. This drives
 * how wide a candidate pair set we build: a question about two named
 * documents narrows to the pairs between them (and gets full detail), while a
 * broad question ranges over the whole corpus (and gets the top-N).
 */
export function detectQueryScope(query: string, inputs: ScopeInputs): QueryScope {
  const lower = query.toLowerCase();

  const docIds: string[] = [];
  for (const dt of inputs.documentTypes) {
    const byId = isBoundedMatch(query, dt.id);
    const byLabel =
      dt.fullLabel.length >= 4 && lower.includes(dt.fullLabel.toLowerCase());
    if (byId || byLabel) docIds.push(dt.id);
  }

  const targetIds: string[] = [];
  for (const t of inputs.targets) {
    if (
      isBoundedMatch(query, t.id) ||
      isBoundedMatch(query, `${t.sourceDocument} ${t.sourceLabel}`) ||
      isBoundedMatch(query, `${t.sourceDocument}: ${t.sourceLabel}`)
    ) {
      targetIds.push(t.id);
    }
  }

  const topic = findTopicCategory(query, inputs.taxonomies);

  let kind: ChatScopeKind;
  if (targetIds.length >= 1) kind = "target";
  else if (docIds.length >= 1) kind = "doc-pair";
  else if (topic) kind = "topic";
  else kind = "broad";

  return { kind, docIds, targetIds, topic };
}

function primaryCategoryId(slot: PrimarySlot | undefined, taxonomy: TopicMatch["taxonomy"]): string | undefined {
  if (!slot) return undefined;
  if (taxonomy === "globe") return slot.globe?.id;
  if (taxonomy === "sector") return slot.sector?.id;
  return slot.adaptation?.id;
}

/**
 * Topic-scoped rankings computed over the FULL alignment set (never the
 * budgeted subset), so the counts the model quotes stay accurate even when
 * the evidence pairs are capped. Mirrors the global rankings approach.
 */
export function buildTopicRankings(
  topic: TopicMatch,
  targets: Target[],
  alignment: AlignmentResult[],
  primaryByTarget: Map<string, PrimarySlot>,
): { byTension: RankedItem[]; byAlignment: RankedItem[] } | null {
  const matching = targets.filter(
    (t) => primaryCategoryId(primaryByTarget.get(t.id), topic.taxonomy) === topic.categoryId,
  );
  if (matching.length === 0) return null;
  const matchingIds = new Set(matching.map((t) => t.id));
  const tension = new Map<string, number>();
  const align = new Map<string, number>();
  for (const a of alignment) {
    if (isContradiction(a.alignment)) {
      if (matchingIds.has(a.targetAId)) tension.set(a.targetAId, (tension.get(a.targetAId) ?? 0) + 1);
      if (matchingIds.has(a.targetBId)) tension.set(a.targetBId, (tension.get(a.targetBId) ?? 0) + 1);
    } else if (a.alignment === "high") {
      if (matchingIds.has(a.targetAId)) align.set(a.targetAId, (align.get(a.targetAId) ?? 0) + 1);
      if (matchingIds.has(a.targetBId)) align.set(a.targetBId, (align.get(a.targetBId) ?? 0) + 1);
    }
  }
  const labelFor = (id: string) => {
    const t = targets.find((tt) => tt.id === id);
    return t ? `${t.sourceDocument}: ${t.sourceLabel}` : id;
  };
  const byTension = matching
    .map((t) => ({ id: t.id, label: labelFor(t.id), count: tension.get(t.id) ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const byAlignment = matching
    .map((t) => ({ id: t.id, label: labelFor(t.id), count: align.get(t.id) ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  return { byTension, byAlignment };
}

function severityWeight(level: AlignmentLevel): number {
  if (level === "flagged") return 3;
  if (level === "high") return 2;
  if (level === "medium") return 1;
  return 0.5;
}

function isDiagnostic(level: AlignmentLevel): boolean {
  return level === "flagged" || level === "high";
}

export interface SelectChatContextArgs {
  query: string;
  scope: QueryScope;
  visibleTargets: Target[];
  visibleAlignment: AlignmentResult[];
  primaryByTarget: Map<string, PrimarySlot>;
  /** Target ids that must keep full text regardless of pair selection: the
   *  top-ranked targets the model may cite for aggregate answers. */
  guaranteedTargetIds: Set<string>;
  budgetTokens?: number;
}

export interface SelectChatContextResult {
  pairs: SelectedPair[];
  /** Targets that should carry full text in the index. Other targets stay in
   *  the index (for id/label resolution, chips, navigation) but without text. */
  fullTextTargetIds: Set<string>;
  meta: ChatContextMeta;
}

/**
 * Select the pair rationales and full-text targets to send to the model,
 * bounded by a token budget and ranked by relevance to the question.
 */
export function selectChatContext({
  query,
  scope,
  visibleTargets,
  visibleAlignment,
  primaryByTarget,
  guaranteedTargetIds,
  budgetTokens = CHAT_CONTEXT_TOKEN_BUDGET,
}: SelectChatContextArgs): SelectChatContextResult {
  const targetById = new Map(visibleTargets.map((t) => [t.id, t]));
  const docOf = (id: string) => targetById.get(id)?.sourceDocument;

  const topicTargetIds = scope.topic
    ? new Set(
        visibleTargets
          .filter((t) => primaryCategoryId(primaryByTarget.get(t.id), scope.topic!.taxonomy) === scope.topic!.categoryId)
          .map((t) => t.id),
      )
    : new Set<string>();
  const docSet = new Set(scope.docIds);
  const namedTargetSet = new Set(scope.targetIds);

  const notNone = visibleAlignment.filter((a) => a.alignment !== "none");

  // Candidate set per scope. Narrow scopes admit all alignment levels (the
  // user asked about a specific slice, so give richer detail); broad scope
  // sticks to diagnostic pairs (flagged + high) to keep signal density up.
  let candidates: AlignmentResult[];
  if (scope.kind === "target") {
    candidates = notNone.filter(
      (a) => namedTargetSet.has(a.targetAId) || namedTargetSet.has(a.targetBId),
    );
  } else if (scope.kind === "doc-pair") {
    candidates = notNone.filter((a) => {
      const da = docOf(a.targetAId);
      const db = docOf(a.targetBId);
      // Two+ named docs: pairs that bridge the named set. One named doc:
      // any pair touching it.
      if (docSet.size >= 2) return !!da && !!db && docSet.has(da) && docSet.has(db);
      return (!!da && docSet.has(da)) || (!!db && docSet.has(db));
    });
  } else if (scope.kind === "topic") {
    candidates = notNone.filter(
      (a) => topicTargetIds.has(a.targetAId) || topicTargetIds.has(a.targetBId),
    );
  } else {
    candidates = notNone.filter((a) => isDiagnostic(a.alignment));
  }

  const qTokens = new Set(tokenizeForTopic(query));
  const scoreOf = (a: AlignmentResult): number => {
    let score = severityWeight(a.alignment);
    if (namedTargetSet.has(a.targetAId) || namedTargetSet.has(a.targetBId)) score += 3;
    const da = docOf(a.targetAId);
    const db = docOf(a.targetBId);
    if ((da && docSet.has(da)) || (db && docSet.has(db))) score += 3;
    if (topicTargetIds.has(a.targetAId) || topicTargetIds.has(a.targetBId)) score += 2;
    if (guaranteedTargetIds.has(a.targetAId) || guaranteedTargetIds.has(a.targetBId)) score += 1;
    if (qTokens.size > 0) {
      const hay = `${a.description ?? ""} ${targetById.get(a.targetAId)?.text ?? ""} ${targetById.get(a.targetBId)?.text ?? ""}`;
      let matches = 0;
      const seen = new Set<string>();
      for (const tok of tokenizeForTopic(hay)) {
        if (qTokens.has(tok) && !seen.has(tok)) {
          seen.add(tok);
          matches++;
          if (matches >= 6) break;
        }
      }
      score += matches * 0.75;
    }
    return score;
  };

  const ranked = candidates
    .map((a) => ({ a, score: scoreOf(a) }))
    .sort((x, y) => y.score - x.score || severityWeight(y.a.alignment) - severityWeight(x.a.alignment));

  const textTokensOf = (id: string) => {
    const t = targetById.get(id);
    return t ? estimateTokens(t.text ?? "") + TARGET_OVERHEAD_TOKENS : 0;
  };
  const pairTokensOf = (a: AlignmentResult, cap: number) =>
    estimateTokens((a.description ?? "").slice(0, cap)) + PAIR_OVERHEAD_TOKENS;

  // Does the entire candidate set fit at full rationale detail? Charge each
  // pair plus the incremental text cost of its endpoints (and the guaranteed
  // top-ranked targets that always keep full text).
  const fullTextIds = new Set<string>();
  for (const id of guaranteedTargetIds) if (targetById.has(id)) fullTextIds.add(id);
  let fullCost = 0;
  for (const id of fullTextIds) fullCost += textTokensOf(id);
  for (const { a } of ranked) {
    fullCost += pairTokensOf(a, RATIONALE_CAP_FULL);
    for (const id of [a.targetAId, a.targetBId]) {
      if (!fullTextIds.has(id)) {
        fullCost += textTokensOf(id);
        fullTextIds.add(id);
      }
    }
  }

  const toSelected = (a: AlignmentResult, cap: number): SelectedPair => ({
    a: a.targetAId,
    b: a.targetBId,
    level: a.alignment,
    mechanism: a.mechanism,
    manageability: a.manageability,
    confidence: a.confidence,
    rationale: (a.description ?? "").slice(0, cap),
  });

  let included: AlignmentResult[];
  let capped: boolean;
  const finalFullText = new Set<string>();
  for (const id of guaranteedTargetIds) if (targetById.has(id)) finalFullText.add(id);

  if (fullCost <= budgetTokens) {
    // Whole candidate set fits: include everything at full detail. This is the
    // "few documents / one topic -> more context each" path.
    included = ranked.map((r) => r.a);
    capped = false;
    for (const a of included) {
      finalFullText.add(a.targetAId);
      finalFullText.add(a.targetBId);
    }
  } else {
    // Overflow: take the highest-relevance pairs until the budget is spent,
    // rationing rationale detail so more pairs fit.
    included = [];
    capped = true;
    let spent = 0;
    for (const id of finalFullText) spent += textTokensOf(id);
    for (const { a } of ranked) {
      let cost = pairTokensOf(a, RATIONALE_CAP_CAPPED);
      const newTargets = [a.targetAId, a.targetBId].filter((id) => !finalFullText.has(id));
      for (const id of newTargets) cost += textTokensOf(id);
      if (spent + cost > budgetTokens) {
        // Stop at the first pair that doesn't fit; everything after is
        // lower-scored, so there's no value in scanning further.
        break;
      }
      included.push(a);
      spent += cost;
      for (const id of newTargets) finalFullText.add(id);
    }
    if (included.length === candidates.length) capped = false;
  }

  const rationaleCap = capped ? RATIONALE_CAP_CAPPED : RATIONALE_CAP_FULL;
  const pairs = included.map((a) => toSelected(a, rationaleCap));

  const meta: ChatContextMeta = {
    scopeKind: scope.kind,
    scopeLabel: scopeLabelFor(scope, visibleTargets),
    pairsConsidered: candidates.length,
    pairsIncluded: included.length,
    capped,
    ...(scope.kind === "doc-pair" && scope.docIds.length ? { docsInFocus: scope.docIds } : {}),
    ...(scope.kind === "topic" && scope.topic ? { topicLabel: scope.topic.categoryLabel } : {}),
  };

  return { pairs, fullTextTargetIds: finalFullText, meta };
}

function scopeLabelFor(scope: QueryScope, targets: Target[]): string {
  if (scope.kind === "doc-pair") {
    if (scope.docIds.length >= 2) {
      return `${scope.docIds.slice(0, -1).join(", ")} and ${scope.docIds[scope.docIds.length - 1]}`;
    }
    return scope.docIds[0] ?? "selected documents";
  }
  if (scope.kind === "topic" && scope.topic) return scope.topic.categoryLabel;
  if (scope.kind === "target") {
    const t = targets.find((tt) => tt.id === scope.targetIds[0]);
    return t ? `${t.sourceDocument}: ${t.sourceLabel}` : "the selected target";
  }
  return "all documents";
}

/**
 * One-line, plain-language caption telling the user what evidence the answer
 * drew on. Uses the canonical alignment vocabulary ("potential misalignment"
 * / "strong alignment"); never "flagged". No em dashes.
 */
export function describeChatContext(meta: ChatContextMeta): string {
  const { pairsIncluded, pairsConsidered, capped } = meta;
  if (pairsIncluded === 0) {
    return "No potential-misalignment or strong-alignment pairs matched this question.";
  }
  if (meta.scopeKind === "doc-pair" && meta.docsInFocus?.length) {
    const docs =
      meta.docsInFocus.length >= 2
        ? `${meta.docsInFocus.slice(0, -1).join(", ")} and ${meta.docsInFocus[meta.docsInFocus.length - 1]}`
        : meta.docsInFocus[0];
    return capped
      ? `Based on the ${pairsIncluded} most relevant of ${pairsConsidered} pairs involving ${docs}.`
      : `Covers all ${pairsIncluded} pairs involving ${docs}.`;
  }
  if (meta.scopeKind === "topic" && meta.topicLabel) {
    return capped
      ? `Focused on ${meta.topicLabel}: the ${pairsIncluded} most relevant of ${pairsConsidered} pairs.`
      : `Focused on ${meta.topicLabel}: all ${pairsIncluded} related pairs.`;
  }
  if (meta.scopeKind === "target") {
    return capped
      ? `Based on the ${pairsIncluded} most relevant of ${pairsConsidered} pairs for ${meta.scopeLabel}.`
      : `Covers all ${pairsIncluded} pairs for ${meta.scopeLabel}.`;
  }
  return capped
    ? `Based on the ${pairsIncluded} most relevant of ${pairsConsidered} potential-misalignment and strong-alignment pairs across all documents.`
    : `Based on all ${pairsIncluded} potential-misalignment and strong-alignment pairs across all documents.`;
}
