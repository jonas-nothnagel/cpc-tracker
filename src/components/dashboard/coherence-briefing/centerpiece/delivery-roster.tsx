"use client";

/**
 * DeliveryRoster — the right-column visual for the Implementation slide.
 * WHO DELIVERS WHAT THE REPORT CONTAINS: every institution the country's own
 * report names on a reported action, with that institution's actions as
 * status-coloured dots. Each row opens to a clean one-line action list.
 *
 * NEUTRALITY (hard rule): this is involvement as stated by the report, never
 * a strain or blame ranking (political-sensitivity guardrail). The caveat
 * spells out the counting honestly: an action naming several institutions
 * counts once for each, so counts read as involvement, not shares of a whole.
 *
 * Status palette (round-4: no gray, it reads as inactive): hollow = planned,
 * light blue = adopted (on paper), blue = ongoing (moving), green =
 * implemented (done). Green marks factual completion only.
 */

import { useTranslations } from "next-intl";

import type {
  DeliveryRosterModel,
  RosterAction,
} from "@/lib/implementation-coherence";

const MAX_INSTITUTIONS = 10;

// Country-reported status: paper stages light, movement blue, completion green.
const STATUS_DOTS: Record<string, { bg: string; border?: string }> = {
  planned: { bg: "#ffffff", border: "var(--undp-blue)" },
  adopted: { bg: "#b3cfe6" },
  ongoing: { bg: "var(--undp-blue)" },
  implemented: { bg: "#16a34a" },
};
const STATUS_OTHER = { bg: "#ffffff", border: "#9ca3af" };

function statusStyle(status: string) {
  return STATUS_DOTS[status.trim().toLowerCase()] ?? STATUS_OTHER;
}

export function DeliveryRoster({
  roster,
  countryName,
}: {
  roster: DeliveryRosterModel;
  countryName: string;
}) {
  const t = useTranslations("briefing.implementationCenter");
  const statusLabel = (status: string) => {
    const key = status.trim().toLowerCase();
    return key in STATUS_DOTS ? t(`status.${key}`) : status;
  };

  const shown = roster.institutions.slice(0, MAX_INSTITUTIONS);
  const more = roster.institutions.length - shown.length;

  return (
    <div className="px-1 space-y-6">
      {/* What the report IS: source, country, and the action mix. */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)]">
          {t("header.eyebrow")}
        </p>
        <p className="text-[15px] font-semibold text-[var(--undp-black)] leading-tight mt-0.5">
          {t("header.title")}
        </p>
        <p className="text-[11.5px] text-[var(--undp-gray)] mt-0.5">
          {t("header.subtitle", { country: countryName })}
        </p>
        <p className="text-[11.5px] text-[var(--undp-black)] mt-1.5">
          {t("mixLine", {
            total: roster.totalActions,
            mitigation: roster.mitigationCount,
            adaptation: roster.adaptationCount,
          })}
        </p>
      </div>

      {/* Involvement rows: institution + its actions as status dots, each row
          explorable to a one-line action list. */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-2">
          {t("roster.heading")}
        </p>
        <ul className="space-y-2.5">
          {shown.map((inst) => (
            <li key={inst.key}>
              <details className="group">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="text-[12px] text-[var(--undp-black)] truncate"
                        title={inst.label}
                      >
                        {inst.label}
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-[var(--undp-gray)]/50 text-[11px]"
                      >
                        +
                      </span>
                    </span>
                    <span className="text-[11px] tabular-nums text-[var(--undp-gray)] shrink-0">
                      {inst.actions.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {inst.actions.map((a) => {
                      const style = statusStyle(a.status);
                      return (
                        <span
                          key={a.id}
                          aria-hidden="true"
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{
                            backgroundColor: style.bg,
                            border: `1px solid ${style.border ?? style.bg}`,
                          }}
                          title={`${a.name} · ${statusLabel(a.status)}`}
                        />
                      );
                    })}
                  </div>
                </summary>
                <ul className="mt-1.5 space-y-0.5 max-h-44 overflow-y-auto pr-1">
                  {inst.actions.map((a) => (
                    <RosterActionRow
                      key={a.id}
                      action={a}
                      statusLabel={statusLabel}
                    />
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
        {more > 0 && (
          <p className="mt-2 text-[11px] text-[var(--undp-gray)]">
            {t("roster.moreInstitutions", { count: more })}
          </p>
        )}
        {roster.actionsWithoutInstitution > 0 && (
          <p className="mt-1.5 text-[11px] text-[var(--undp-gray)]">
            {t("roster.noInstitution", {
              count: roster.actionsWithoutInstitution,
            })}
          </p>
        )}

        {/* Status legend with counts. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] text-[var(--undp-gray)]">
          {roster.statusMix.map((s) => {
            const style = statusStyle(s.status);
            return (
              <span key={s.status} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: style.bg,
                    border: `1px solid ${style.border ?? style.bg}`,
                  }}
                />
                {statusLabel(s.status)}
                <span className="tabular-nums">{s.count}</span>
              </span>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] italic text-[var(--undp-gray)]">
          {t("roster.involvementNote")}
        </p>
        <p className="mt-1 text-[11px] italic text-[var(--undp-gray)]">
          {t("statusNote")}
        </p>
      </div>
    </div>
  );
}

// One compact action row: status dot + the FULL action name (wrapping, so it
// can actually be read), status word right-aligned at the top line.
function RosterActionRow({
  action,
  statusLabel,
}: {
  action: RosterAction;
  statusLabel: (status: string) => string;
}) {
  const style = statusStyle(action.status);
  return (
    <li className="flex items-start gap-1.5 text-[11px] leading-snug">
      <span
        aria-hidden="true"
        className="inline-block w-2 h-2 rounded-full shrink-0 mt-[3px]"
        style={{
          backgroundColor: style.bg,
          border: `1px solid ${style.border ?? style.bg}`,
        }}
      />
      <span className="text-[var(--undp-black)] flex-1 min-w-0">
        {action.name}
      </span>
      <span className="text-[var(--undp-gray)] shrink-0">
        {statusLabel(action.status)}
      </span>
    </li>
  );
}
