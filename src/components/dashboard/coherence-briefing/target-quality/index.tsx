"use client";

/**
 * "Elements stated" — how fully a target defines itself (removable system;
 * see README.md).
 *
 * WHY: the Panama focal-group report (23 Jul 2026) asked the tool to grow
 * toward "goals, indicators, progress". A planner cannot track a target that
 * does not say what will change, by how much, where, or by when, and telling
 * them which targets are ready to monitor is the most useful thing this
 * analysis can add without new data.
 *
 * WHAT IT SHOWS: five dots, one per element the target's text states. Hovering
 * or focusing names each element and quotes the exact phrase from the target
 * that supports it.
 *
 * HARD RULES (political-sensitivity guardrail, CLAUDE.md):
 *   - Element PRESENCE, never a grade. No score, no "weak"/"poor", no
 *     "incomplete". "3 of 5 elements stated" is an observation about the text;
 *     "3 out of 5 quality" is a judgement of whoever wrote it.
 *   - Nothing here may rank documents, sectors, or institutions.
 *   - Every stated element carries its quote. The pipeline already drops any
 *     claim it could not quote verbatim from the target.
 *   - Labelled AI-generated with the standard caveat.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  TARGET_DEFINITION_ELEMENTS,
  type Target,
  type TargetDefinitionElement,
} from "@/types";

/** Filled = the text states this element. Hollow = it does not say. Neutral
 *  grey throughout: a colour ramp would read as a score. */
function ElementDot({ stated }: { stated: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-[7px] w-[7px] rounded-full shrink-0"
      style={
        stated
          ? { backgroundColor: "var(--undp-gray)" }
          : { boxShadow: "inset 0 0 0 1px var(--undp-gray)", opacity: 0.5 }
      }
    />
  );
}

export function statedCount(target: Pick<Target, "definition">): number {
  const elements = target.definition?.elements;
  if (!elements) return 0;
  return TARGET_DEFINITION_ELEMENTS.filter((e) => elements[e]).length;
}

/**
 * The compact chip: five dots plus "n of 5 stated", expanding on hover, focus,
 * or tap to the per-element breakdown with quoted evidence.
 *
 * Returns null when the country has no `target_quality.json` — the whole
 * feature hides rather than rendering an empty shell.
 */
export function DefinitionChip({ target }: { target: Pick<Target, "definition"> }) {
  const t = useTranslations("briefing.targetQuality");
  const [open, setOpen] = useState(false);
  const definition = target.definition;

  if (!definition?.elements) return null;

  const total = TARGET_DEFINITION_ELEMENTS.length;
  const stated = statedCount(target);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-expanded={open}
        aria-label={t("chipAria", { stated, total })}
        className="inline-flex items-center gap-1 text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] transition-colors"
      >
        <span className="inline-flex items-center gap-[3px]">
          {TARGET_DEFINITION_ELEMENTS.map((element) => (
            <ElementDot key={element} stated={Boolean(definition.elements[element])} />
          ))}
        </span>
        <span className="tabular-nums">{t("chipLabel", { stated, total })}</span>
      </button>

      {open && (
        <span
          role="dialog"
          aria-label={t("panelAria")}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-50 mt-1.5 w-[320px] max-w-[90vw] cursor-default rounded-lg border border-line bg-white p-3.5 text-left shadow-lg"
        >
          <p className="text-caption font-semibold text-[var(--undp-black)] mb-2">
            {t("panelTitle", { stated, total })}
          </p>
          <ul className="space-y-1.5">
            {TARGET_DEFINITION_ELEMENTS.map((element) => (
              <ElementRow
                key={element}
                element={element}
                stated={Boolean(definition.elements[element])}
                evidence={definition.evidence?.[element] ?? ""}
              />
            ))}
          </ul>
          <p className="mt-2.5 border-t border-line-soft pt-2 text-caption leading-relaxed text-[var(--undp-gray)]">
            {t("caveat")}
          </p>
        </span>
      )}
    </span>
  );
}

function ElementRow({
  element,
  stated,
  evidence,
}: {
  element: TargetDefinitionElement;
  stated: boolean;
  evidence: string;
}) {
  const t = useTranslations("briefing.targetQuality");
  return (
    <li className="flex items-start gap-2">
      <span className="mt-[6px]">
        <ElementDot stated={stated} />
      </span>
      <span className="min-w-0">
        <span
          className={`text-caption ${
            stated
              ? "font-medium text-[var(--undp-black)]"
              : "text-[var(--undp-gray)]"
          }`}
        >
          {t(`element.${element}` as "element.action")}
        </span>
        {stated && evidence ? (
          // The quote is the whole point: it is what makes this an observation
          // about the text rather than an opinion about the target.
          <span className="block text-caption italic leading-snug text-[var(--undp-gray)]">
            &ldquo;{evidence}&rdquo;
          </span>
        ) : (
          <span className="block text-caption leading-snug text-[var(--undp-gray)]/80">
            {t("notStated")}
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * Per-document readout: how many of a document's targets state each element.
 *
 * Counts only — deliberately no ordering, no "best"/"worst" document, and no
 * comparison between documents, because a document whose targets are broad by
 * design is not thereby a worse document.
 */
export function DefinitionCoverage({
  targets,
}: {
  targets: Pick<Target, "definition">[];
}) {
  const t = useTranslations("briefing.targetQuality");
  const assessed = targets.filter((x) => x.definition?.elements);
  if (assessed.length === 0) return null;

  return (
    <div className="mt-2">
      <p className="text-caption text-[var(--undp-gray)] leading-snug">
        {TARGET_DEFINITION_ELEMENTS.map((element) => {
          const n = assessed.filter((x) => x.definition?.elements[element]).length;
          return t("coverageItem", {
            count: n,
            total: assessed.length,
            element: t(`element.${element}` as "element.action"),
          });
        }).join(" · ")}
      </p>
      <p className="text-caption text-[var(--undp-gray)]/80 leading-snug mt-0.5">
        {t("caveat")}
      </p>
    </div>
  );
}
