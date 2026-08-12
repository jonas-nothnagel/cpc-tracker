"use client";

/**
 * How well defined a target is (removable system; see README.md).
 *
 * WHY: the Panama focal-group report (23 Jul 2026) asked the tool to grow
 * toward "goals, indicators, progress". A target that does not say what will
 * change, by how much, where, or by when cannot be monitored as written, and
 * telling a planner which of their targets are ready to track is the most
 * useful thing this analysis can add without new data.
 *
 * WHAT IT IS: an assessment of target quality against five criteria a trackable
 * target meets, with the supporting wording quoted for each one it meets.
 *
 * The first version of this hedged so hard it stopped saying anything — the
 * chip read "3 of 5 stated" and the caveat said it described "what the text
 * says, not how good the target is", which is a denial of the whole point.
 * Readers could not tell what was being measured. It now names the judgement.
 *
 * WHAT IT JUDGES, AND WHAT IT DOES NOT. It judges how fully a target is
 * WRITTEN — whether it can be tracked. It says nothing about whether the policy
 * is right, ambitious enough, or a priority: a broad framing principle is not a
 * bad commitment for lacking a number, and the caveat says so.
 *
 * HARD RULES that survive from the original design:
 *   - Every criterion marked met carries its verbatim quote. The pipeline drops
 *     any claim it could not locate in the target, so an unquotable criterion
 *     is reported as unmet rather than asserted.
 *   - NOTHING RANKS documents, sectors, or institutions by this. Assessing an
 *     individual target against standard criteria is ordinary M&E practice;
 *     a league table of "which ministry writes the worst targets" is the blame
 *     vector the political-sensitivity guardrail exists to prevent. A
 *     per-document rollup component was written and deliberately deleted.
 *   - Labelled AI-assessed wherever it appears.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  TARGET_DEFINITION_ELEMENTS,
  type Target,
  type TargetDefinitionElement,
} from "@/types";

/** Met = the target's wording satisfies this criterion. Neutral grey rather
 *  than a red-to-green ramp: the verdict belongs in words, where it can be
 *  precise about judging the wording and not the policy. A red dot on a
 *  government commitment says something blunter than we mean. */
function CriterionDot({ met }: { met: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-[7px] w-[7px] rounded-full shrink-0"
      style={
        met
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
 * Banded verdict on the count, so a reader gets an answer before they get a
 * number. "Broadly defined" rather than "poorly defined": it describes the
 * wording without implying the commitment behind it is careless, and keeps to
 * the house rule against a bare "low" as a label.
 */
export function definitionBand(
  stated: number,
): "full" | "partial" | "broad" {
  if (stated >= TARGET_DEFINITION_ELEMENTS.length) return "full";
  if (stated >= 3) return "partial";
  return "broad";
}

/**
 * The compact chip: a verdict, the score behind it, and five dots. Expands on
 * hover, focus, or tap to the per-criterion breakdown with quoted evidence.
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
  const band = definitionBand(stated);

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
        aria-label={t("chipAria", { verdict: t(`band.${band}` as "band.full"), stated, total })}
        className="inline-flex items-center gap-1.5 text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] transition-colors"
      >
        <span className="font-medium text-[var(--undp-black)]">
          {t(`band.${band}` as "band.full")}
        </span>
        <span className="tabular-nums">{t("chipScore", { stated, total })}</span>
        <span className="inline-flex items-center gap-[3px]">
          {TARGET_DEFINITION_ELEMENTS.map((element) => (
            <CriterionDot key={element} met={Boolean(definition.elements[element])} />
          ))}
        </span>
      </button>

      {open && (
        <span
          role="dialog"
          aria-label={t("panelAria")}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-50 mt-1.5 w-[330px] max-w-[90vw] cursor-default rounded-lg border border-line bg-white p-3.5 text-left shadow-lg"
        >
          <p className="text-caption font-semibold text-[var(--undp-black)]">
            {t("panelTitle")}
          </p>
          <p className="mt-0.5 mb-2.5 text-caption text-[var(--undp-gray)]">
            {t("panelSubtitle", { stated, total })}
          </p>
          <ul className="space-y-1.5">
            {TARGET_DEFINITION_ELEMENTS.map((element) => (
              <CriterionRow
                key={element}
                element={element}
                met={Boolean(definition.elements[element])}
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

function CriterionRow({
  element,
  met,
  evidence,
}: {
  element: TargetDefinitionElement;
  met: boolean;
  evidence: string;
}) {
  const t = useTranslations("briefing.targetQuality");
  return (
    <li className="flex items-start gap-2">
      <span className="mt-[6px]">
        <CriterionDot met={met} />
      </span>
      <span className="min-w-0">
        <span
          className={`text-caption ${
            met
              ? "font-medium text-[var(--undp-black)]"
              : "text-[var(--undp-gray)]"
          }`}
        >
          {t(`element.${element}` as "element.action")}
        </span>
        {met && evidence ? (
          // The quote is what makes this checkable rather than an opinion: a
          // reader can see the words the assessment relied on.
          <span className="block text-caption italic leading-snug text-[var(--undp-gray)]">
            &ldquo;{evidence}&rdquo;
          </span>
        ) : (
          <span className="block text-caption leading-snug text-[var(--undp-gray)]/80">
            {t("notMet")}
          </span>
        )}
      </span>
    </li>
  );
}
