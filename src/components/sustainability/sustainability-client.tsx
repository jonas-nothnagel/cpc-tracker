"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { FOOTPRINT_EVENTS } from "@/data/footprint-events";
import { downloadFile } from "@/lib/download";
import { everydayEquivalents } from "@/lib/footprint/equivalents";
import type {
  FootprintEnvelope,
  FootprintMetrics,
  FootprintRollup,
  LedgerEvent,
} from "@/lib/footprint/types";
import { groupByUse, recordedSpan, regionsOf } from "@/lib/footprint/uses";
import { useAmounts } from "./amounts";
import { RESOURCES, type Resource } from "./resources";
import { RunningTotal } from "./running-total";
import { UseField } from "./use-field";

// ---------------------------------------------------------------------------
// Export. CSV is the full ledger (one row per recorded event); JSON is the
// whole rollup. Both download client-side, no server round trip.
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  "ts",
  "component",
  "model",
  "region",
  "country",
  "run_id",
  "call_count",
  "cached_call_count",
  "energy_wh",
  "water_ml",
  "co2_geq",
  "minerals_ugsbeq",
  // Schema-2 bounds: empty cells on rows recorded before August 2026. The
  // CSV is the full ledger, so the modelled ranges shown on the page must be
  // reproducible from it.
  "energy_wh_min",
  "energy_wh_max",
  "water_ml_min",
  "water_ml_max",
  "co2_geq_min",
  "co2_geq_max",
  "minerals_ugsbeq_min",
  "minerals_ugsbeq_max",
  "source",
] as const;

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(events: LedgerEvent[]): string {
  const rows = [CSV_COLUMNS.join(",")];
  for (const e of events) {
    rows.push(CSV_COLUMNS.map((c) => csvCell(e[c])).join(","));
  }
  return rows.join("\n");
}

// The modelled range is shown only when it is informative: enough of the
// recorded carbon actually carries bounds (older rows contribute their
// midpoint to both ends, which would render a fake zero-width range), and
// the envelope is meaningfully wider than the midpoint.
function envelopeRange(
  envelope: FootprintEnvelope,
  key: keyof FootprintMetrics,
  midpoint: number,
): { min: number; max: number } | null {
  if (envelope.bounded_share < 0.3 || midpoint <= 0) return null;
  const { min, max } = envelope[key];
  return (max - min) / midpoint < 0.02 ? null : { min, max };
}

// Everyday anchors round to one decimal while small, whole numbers once large.
function eqRound(v: number): number {
  return v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
}

const quietLink =
  "text-[var(--undp-black)] underline decoration-[rgba(35,46,61,0.35)] underline-offset-4 hover:text-[var(--undp-blue)] hover:decoration-current transition-colors";

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: FootprintRollup };

export function SustainabilityClient() {
  const t = useTranslations("sustainability");
  const brand = useTranslations("header")("brand");
  const locale = useLocale();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sustainability")
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json() as Promise<FootprintRollup>;
      })
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({
            status: "error",
            message: err instanceof Error ? err.message : t("errors.loadFailed"),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const data =
    state.status === "ready" && state.data.totals.event_count > 0 ? state.data : null;

  return (
    <main className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
      <header className="mb-8">
        <a
          href={locale === "en" ? "/" : `/${locale}`}
          className="group mb-6 flex w-fit items-center gap-3 text-sm font-medium text-[var(--undp-black)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the app's own lockup, small and static */}
          <img src="/undp-logo.png" alt="UNDP" width={22} height={44} className="h-11 w-auto" />{" "}
          <span className="underline-offset-4 group-hover:underline">{brand}</span>
        </a>
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push("/");
          }}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors mb-4"
        >
          <span aria-hidden="true">&larr;</span> {t("back")}
        </button>
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <h1
            className="text-3xl sm:text-4xl text-[var(--undp-black)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("title")}
          </h1>
          {data && <Downloads data={data} />}
        </div>
        {data && <Span events={data.events} />}
      </header>

      {state.status === "loading" && (
        <p className="text-sm text-[var(--undp-gray)]">{t("loading")}</p>
      )}

      {state.status === "error" && (
        <p className="text-sm text-[var(--undp-red)]" role="alert">
          {t("errors.withMessage", { message: state.message })}
        </p>
      )}

      {state.status === "ready" && !data && (
        <p className="text-sm text-[var(--undp-gray)]">{t("empty")}</p>
      )}

      {data && <Monitor data={data} />}
    </main>
  );
}

/**
 * The figures and what lies behind them. One of the four figures is the
 * resource the field and the running total show; the use pointed at or chosen
 * in the field is marked on the running total too.
 */
function Monitor({ data }: { data: FootprintRollup }) {
  const [resource, setResource] = useState<Resource>("co2_geq");
  const [pointed, setPointed] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const uses = useMemo(() => groupByUse(data.events), [data.events]);
  const focusKey = pointed ?? chosen;
  const focus = uses.find((u) => u.key === focusKey) ?? null;
  return (
    <>
      <Figures data={data} resource={resource} onResource={setResource} />
      <UseField
        uses={uses}
        resource={resource}
        pointed={pointed}
        chosen={chosen}
        onPoint={setPointed}
        onChoose={setChosen}
      />
      <RunningTotal
        events={data.events}
        resource={resource}
        focus={focus ? { kind: focus.kind, country: focus.country } : null}
        curated={FOOTPRINT_EVENTS}
      />
      <Sources events={data.events} />
    </>
  );
}

/** The days the record covers, under the title. */
function Span({ events }: { events: LedgerEvent[] }) {
  const t = useTranslations("sustainability");
  const { date } = useAmounts();
  const span = recordedSpan(events);
  if (!span) return null;
  const sameYear = span.from.slice(0, 4) === span.to.slice(0, 4);
  return (
    <p className="mt-2 text-sm text-[var(--undp-gray)]">
      {span.from === span.to
        ? date(span.to)
        : t("span", { from: date(span.from, !sameYear), to: date(span.to) })}
    </p>
  );
}

function Downloads({ data }: { data: FootprintRollup }) {
  const t = useTranslations("sustainability");
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <p className="flex items-baseline gap-3 text-sm text-[var(--undp-gray)]">
      <span>{t("download")}</span>
      <button
        type="button"
        title={t("downloadCsvTitle")}
        className={quietLink}
        onClick={() => downloadFile(`cpc-footprint-${stamp}.csv`, toCsv(data.events), "text/csv")}
      >
        {t("downloadCsv")}
      </button>
      <button
        type="button"
        title={t("downloadJsonTitle")}
        className={quietLink}
        onClick={() =>
          downloadFile(
            `cpc-footprint-${stamp}.json`,
            JSON.stringify(data, null, 2),
            "application/json",
          )
        }
      >
        {t("downloadJson")}
      </button>
    </p>
  );
}

/**
 * The four totals as plain figures, each with what it amounts to in everyday
 * terms right under it, then the requests behind them. The figures are also
 * the choice of resource for everything below: the one chosen carries an ink
 * rule on top.
 */
function Figures({
  data,
  resource,
  onResource,
}: {
  data: FootprintRollup;
  resource: Resource;
  onResource: (resource: Resource) => void;
}) {
  const t = useTranslations("sustainability");
  const { amount, number, share } = useAmounts();
  const { totals, envelope } = data;
  const eq = everydayEquivalents(totals);
  // An anchor that rounds to nothing informs nobody: leave it out.
  const anchor = (key: "petrol" | "ev" | "bathtubs", count: number) => {
    const rounded = eqRound(count);
    return rounded > 0 ? t(`figures.${key}`, { count: rounded }) : null;
  };
  const notes: Record<Resource, string | null> = {
    co2_geq: anchor("petrol", eq.petrolLitres),
    energy_wh: anchor("ev", eq.evCharges),
    water_ml: anchor("bathtubs", eq.bathtubs),
    minerals_ugsbeq: t("figures.mineralsNote"),
  };
  const unitTitles: Partial<Record<Resource, string>> = {
    co2_geq: t("figures.carbonUnitTitle"),
    energy_wh: t("figures.energyUnitTitle"),
    minerals_ugsbeq: t("figures.mineralsUnitTitle"),
  };

  const reused = data.events.reduce((sum, e) => sum + e.cached_call_count, 0);
  const calls = number(totals.call_count);

  return (
    <section>
      <div role="group" aria-label={t("select")} className="grid grid-cols-2 gap-y-2 lg:grid-cols-4">
        {RESOURCES.map((r) => {
          const value = amount(totals[r.key], r.key);
          const unit = r.suffix ? `${value.unit} ${r.suffix}` : value.unit;
          const range = envelopeRange(envelope, r.key, totals[r.key]);
          const selected = r.key === resource;
          const unitTitle = unitTitles[r.key];
          return (
            <button
              key={r.key}
              type="button"
              data-testid="fp-figure"
              aria-pressed={selected}
              onClick={() => onResource(r.key)}
              className={`group flex flex-col items-start border-t-2 pb-4 pr-4 pt-3 text-left transition-colors lg:px-5 lg:first:pl-0 ${
                selected
                  ? "border-[var(--undp-blue)]"
                  : "border-[var(--color-line)] hover:border-[var(--undp-gray)]"
              }`}
            >
              <span
                className={`text-data ${selected ? "font-semibold text-[var(--undp-blue)]" : "text-[var(--undp-gray)]"}`}
              >
                {t(`figures.${r.label}`)}
              </span>
              <span className="fp-figure-value mt-1 text-3xl font-medium tabular-nums text-[var(--undp-black)]">
                {value.value}{" "}
                <span className="text-base font-normal text-[var(--undp-gray)]">
                  {unitTitle ? (
                    <abbr title={unitTitle} className="cursor-help no-underline">
                      {unit}
                    </abbr>
                  ) : (
                    unit
                  )}
                </span>
              </span>
              {notes[r.key] && (
                <span className="fp-figure-note mt-1 text-data text-[var(--undp-black)]">{notes[r.key]}</span>
              )}
              {range && (
                <span className="mt-0.5 text-caption tabular-nums text-[var(--undp-gray)]">
                  {t("figures.range", {
                    min: `${amount(range.min, r.key).value} ${amount(range.min, r.key).unit}`,
                    max: `${amount(range.max, r.key).value} ${amount(range.max, r.key).unit}`,
                  })}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-data text-[var(--undp-gray)]">
        {reused > 0 && totals.call_count > 0
          ? t("requestsReused", { calls, share: share(reused / totals.call_count) })
          : t("requests", { calls })}
      </p>
    </section>
  );
}

/** Where the figures come from: one line each, at the foot of the page. */
function Sources({ events }: { events: LedgerEvent[] }) {
  const t = useTranslations("sustainability");
  return (
    <footer className="mt-14 border-t border-[var(--color-line)] pt-4 space-y-1 text-caption text-[var(--undp-gray)]">
      <p>
        {t.rich("sources.method", {
          regions: regionsOf(events).join(", "),
          link: (chunks) => (
            <a
              href="https://ecologits.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--undp-blue)]"
            >
              {chunks}
            </a>
          ),
        })}
      </p>
      <p>{t("sources.inputTokens")}</p>
      <p>{t("sources.azure")}</p>
      <p>{t("sources.equivalents")}</p>
    </footer>
  );
}
