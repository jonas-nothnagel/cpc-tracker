import { getCountry, isValidCountryId } from "@/config/countries";

import { anchorKeyOf } from "./anchor";

import {
  FEEDBACK_COMMENT_MAX,
  FEEDBACK_SNAPSHOT_MAX,
  type FeedbackContext,
  type FeedbackEvent,
  type FeedbackSurface,
  type FeedbackVote,
} from "./types";

/**
 * Validate an untrusted POST /api/feedback body into a ledger-ready event
 * (minus the server-stamped schema/ts). Pure function so every rule is
 * unit-testable without the route.
 */

const SURFACES: ReadonlySet<FeedbackSurface> = new Set([
  "target_pair_rationale",
  "doc_pair_synthesis",
  "corpus_storyline",
]);
const VOTES: ReadonlySet<FeedbackVote> = new Set(["up", "down", "retracted"]);
const LOCALES = new Set(["en", "es", "mn"]);

/**
 * Target / doc-type ids as they appear in the pipeline outputs, or slugified
 * storyline names (Unicode: Mongolian storylines are Cyrillic). Anchor ids
 * never become filesystem paths (only the country does), but require at
 * least one letter/number so punctuation-only ids like ".." are rejected.
 */
const ANCHOR_ID = /^(?=.*[\p{L}\p{N}])[\p{L}\p{N}_.\-]{1,128}$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_HEX = /^[a-f0-9]{64}$/;
/** Context values are pipeline enum tokens (e.g. "goal_conflict"). */
const CONTEXT_VALUE = /^[a-z_]{1,64}$/;
const CONTEXT_KEYS = [
  "alignment",
  "mechanism",
  "confidence",
  "manageability",
  "synthesisConfidence",
  "storylineType",
] as const;

export type ParsedFeedback =
  | { ok: true; event: Omit<FeedbackEvent, "schema" | "ts"> }
  | { ok: false; error: string };

export function parseFeedbackBody(raw: unknown): ParsedFeedback {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const body = raw as Record<string, unknown>;

  // Country: lowercase, registry lookup, canonical id (becomes a file path
  // segment, so isValidCountryId runs first as defense-in-depth).
  const rawCountry =
    typeof body.country === "string" ? body.country.toLowerCase() : "";
  if (!isValidCountryId(rawCountry)) {
    return { ok: false, error: "Invalid country" };
  }
  const country = getCountry(rawCountry);
  if (!country) {
    return { ok: false, error: "Unknown country" };
  }

  const surface = body.surface;
  if (typeof surface !== "string" || !SURFACES.has(surface as FeedbackSurface)) {
    return { ok: false, error: "Unknown surface" };
  }

  const vote = body.vote;
  if (typeof vote !== "string" || !VOTES.has(vote as FeedbackVote)) {
    return { ok: false, error: "Unknown vote" };
  }

  // 1 id (storyline) or 2 (pair / doc-pair), each anchor-shaped, distinct.
  const anchorIds = body.anchorIds;
  if (
    !Array.isArray(anchorIds) ||
    anchorIds.length < 1 ||
    anchorIds.length > 2 ||
    anchorIds.some((id) => typeof id !== "string" || !ANCHOR_ID.test(id)) ||
    new Set(anchorIds).size !== anchorIds.length
  ) {
    return { ok: false, error: "Invalid anchor ids" };
  }
  const ids = anchorIds as string[];
  const anchorKey = anchorKeyOf(ids);

  let comment: string | null = null;
  if (body.comment !== undefined && body.comment !== null) {
    if (typeof body.comment !== "string") {
      return { ok: false, error: "Invalid comment" };
    }
    if (body.comment.length > FEEDBACK_COMMENT_MAX) {
      return { ok: false, error: "Comment too long" };
    }
    const trimmed = body.comment.trim();
    comment = trimmed.length > 0 ? trimmed : null;
  }

  const clientId = body.clientId;
  if (typeof clientId !== "string" || !UUID.test(clientId)) {
    return { ok: false, error: "Invalid client id" };
  }

  const locale =
    typeof body.locale === "string" && LOCALES.has(body.locale)
      ? body.locale
      : "en";

  const contentHash = body.contentHash;
  if (typeof contentHash !== "string" || !SHA256_HEX.test(contentHash)) {
    return { ok: false, error: "Invalid content hash" };
  }

  if (typeof body.contentSnapshot !== "string") {
    return { ok: false, error: "Missing content snapshot" };
  }
  const contentSnapshot = body.contentSnapshot.slice(0, FEEDBACK_SNAPSHOT_MAX);

  const context: FeedbackContext = {};
  if (typeof body.context === "object" && body.context !== null) {
    const rawContext = body.context as Record<string, unknown>;
    for (const key of CONTEXT_KEYS) {
      const value = rawContext[key];
      if (typeof value === "string" && CONTEXT_VALUE.test(value)) {
        context[key] = value;
      }
    }
  }

  return {
    ok: true,
    event: {
      country: country.id,
      surface: surface as FeedbackSurface,
      anchorKey,
      anchorIds: ids,
      vote: vote as FeedbackVote,
      comment,
      clientId,
      locale,
      contentHash,
      contentSnapshot,
      context,
    },
  };
}
