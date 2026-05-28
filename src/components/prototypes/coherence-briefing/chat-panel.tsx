"use client";

/**
 * ChatPanel — lean chat for the Explore section.
 *
 * Wraps the existing /api/coherence-chat route. Sends a minimal request
 * (query + dataset context + 3-turn history) and renders the reply. When the
 * server returns navigation actions we surface a single opt-in "Show this on
 * the wheel" control rather than reshaping the wheel behind the user's
 * reading; clicking it routes the actions through onApplyAction (the same
 * resolver the insight bar uses), so the wheel reacts the same way whatever
 * drove it.
 *
 * Aesthetic stays consistent with the rest of the page: off-white,
 * serif headline, calm spacing. No emojis, no bot avatars.
 */

import { useCallback, useState } from "react";
import { buildChatRequest } from "@/lib/coherence-chat";
import type {
  ChatAction,
  ChatHistoryTurn,
  ChatTaxCategory,
} from "@/lib/coherence-chat";
import type {
  AlignmentResult,
  CorpusThemes,
  CountryConfig,
  DocPairSynthesis,
  PolicyDocumentType,
  SectorSynthesis,
  Target,
  ThematicClassification,
} from "@/types";

interface ChatReply {
  reply: string;
  suggestions: { label: string; query: string }[];
  actions: ChatAction[];
}

export function ChatPanel({
  targets,
  alignment,
  classifications,
  sectors,
  globeCategories,
  countryConfig,
  availableDocs,
  docPairSyntheses,
  corpusThemes,
  sectorSyntheses,
  starterPrompts,
  onApplyAction,
}: {
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: ThematicClassification[];
  sectors: ChatTaxCategory[];
  globeCategories: ChatTaxCategory[];
  countryConfig: CountryConfig | null;
  availableDocs: PolicyDocumentType[];
  docPairSyntheses: DocPairSynthesis[];
  corpusThemes: CorpusThemes | null;
  sectorSyntheses: SectorSynthesis[];
  starterPrompts: string[];
  onApplyAction: (action: ChatAction) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<ChatReply | null>(null);
  const [history, setHistory] = useState<ChatHistoryTurn[]>([]);

  const ask = useCallback(
    async (q: string) => {
      const text = q.trim();
      if (!text || loading) return;
      setLoading(true);
      setError(null);
      try {
        const body = buildChatRequest({
          query: text,
          groupMode: "document",
          filter: "all",
          targets,
          alignment,
          classifications,
          sectors,
          globeCategories,
          budgetSummary: null,
          btrData: null,
          availableDocs,
          hiddenDocs: new Set<string>(),
          countryConfig,
          history,
          corpusThemes,
          docPairSyntheses,
          sectorSyntheses,
        });
        const res = await fetch("/api/coherence-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          let message = `Request failed (${res.status})`;
          try {
            const err = (await res.json()) as { error?: string };
            if (err.error) message = err.error;
          } catch {}
          throw new Error(message);
        }
        const json = (await res.json()) as {
          reply: string;
          suggestions?: { label: string; query: string }[];
          actions?: ChatAction[];
        };
        setReply({
          reply: json.reply,
          suggestions: (json.suggestions ?? []).slice(0, 3),
          actions: json.actions ?? [],
        });
        setHistory((prev) =>
          [
            ...prev,
            { role: "user" as const, content: text },
            { role: "assistant" as const, content: json.reply },
          ].slice(-6),
        );
        setQuery("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "That didn't work.");
      } finally {
        setLoading(false);
      }
    },
    [
      loading,
      targets,
      alignment,
      classifications,
      sectors,
      globeCategories,
      countryConfig,
      availableDocs,
      history,
      corpusThemes,
      docPairSyntheses,
      sectorSyntheses,
    ],
  );

  return (
    <div className="flex flex-col h-full">
      <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
        Ask the corpus
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(query);
        }}
        className="mb-4"
      >
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Which two documents disagree the most?"
            className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--undp-black)] focus:border-[var(--undp-black)] placeholder:text-gray-400"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            aria-label="Send"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded text-xs font-medium text-white bg-[var(--undp-black)] disabled:bg-gray-300 transition-colors"
          >
            {loading ? "…" : "Ask →"}
          </button>
        </div>
      </form>

      {!reply && !error && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
            Try one of these
          </p>
          <div className="flex flex-col gap-2">
            {starterPrompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => ask(p)}
                disabled={loading}
                className="text-left text-sm text-[var(--undp-black)] px-3 py-2 rounded-md border border-gray-200 bg-white/60 hover:bg-white hover:border-[var(--undp-black)] transition-colors disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {reply && (
        <div className="space-y-3 overflow-y-auto pr-2 flex-1">
          <div className="rounded-md border border-gray-200 bg-white p-4">
            <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
              Reply
            </p>
            <p className="text-sm text-[var(--undp-black)] leading-relaxed whitespace-pre-wrap">
              {reply.reply}
            </p>
          </div>
          {reply.actions.length > 0 && (
            <button
              type="button"
              onClick={() => {
                for (const a of reply.actions) onApplyAction(a);
              }}
              className="self-start text-xs font-medium text-[var(--undp-black)] hover:underline"
            >
              Show this on the wheel →
            </button>
          )}
          {reply.suggestions.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
                Keep going
              </p>
              {reply.suggestions.map((s) => (
                <button
                  key={s.query}
                  type="button"
                  onClick={() => ask(s.query)}
                  disabled={loading}
                  className="text-left text-xs text-[var(--undp-black)] px-3 py-2 rounded-md border border-gray-200 bg-white/60 hover:bg-white hover:border-[var(--undp-black)] transition-colors disabled:opacity-50"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="mt-auto pt-4 text-[10px] text-[var(--undp-gray)] leading-relaxed">
        Chat answers are AI-generated against the same dataset shown on
        the wheel. Treat as a navigation aid, not a final verdict.
      </p>
    </div>
  );
}
