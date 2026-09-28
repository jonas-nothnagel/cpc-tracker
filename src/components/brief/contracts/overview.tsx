"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { areaFinding, areaRows, NO_AREA } from "@/lib/brief/contracts/areas";
import { buildField, type FieldLabel, type Stage } from "@/lib/brief/contracts/field";
import type { GeoFile } from "@/lib/brief/contracts/geo";
import { NO_PLACE, tierTotals, type Contract, type LensKey } from "@/lib/brief/contracts/model";
import { placeFinding, placeKey, placeRows } from "@/lib/brief/contracts/places";
import type { ContractsSetup } from "@/lib/brief/contracts/setup";
import { targetLine } from "@/lib/brief/text";
import { MoneyField, type FieldPoint } from "./money-field";
import { useMoney } from "./money";
import { SetLine } from "./set-line";

type Step = "record" | "purpose" | "areas" | "places";

/** Contracts listed beside a policy area or place. */
const LIST_MAX = 5;

/** The step across the middle of the window, if any. */
function stepAtMiddle(root: HTMLElement | null): Step | null {
  const y = window.innerHeight / 2;
  for (const el of root?.querySelectorAll<HTMLElement>("[data-step]") ?? []) {
    const box = el.getBoundingClientRect();
    if (box.top <= y && box.bottom >= y) return el.dataset.step as Step;
  }
  return null;
}

/**
 * The overview: the whole public contract record as squares of equal money
 * beside four steps, each a level deeper. The record by year; its share for
 * nature or climate; that money toward each policy area beside the area's
 * targets; and where it lands. The squares re-form as each step crosses the
 * middle of the window.
 */
export function Overview({
  setup,
  geo,
  lens,
  onLens,
  onContract,
  onTarget,
}: {
  setup: ContractsSetup;
  geo: GeoFile | null;
  lens: LensKey;
  onLens: (lens: LensKey) => void;
  onContract: (id: string) => void;
  onTarget: (id: string) => void;
}) {
  const t = useTranslations("brief.contracts");
  const tl = useTranslations("briefing.lens");
  const format = useFormatter();
  const m = useMoney();
  const file = setup.file;
  const steps = useMemo<Step[]>(() => (geo ? ["record", "purpose", "areas", "places"] : ["record", "purpose", "areas"]), [geo]);
  const [active, setActive] = useState<Step>("record");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const step = (entry.target as HTMLElement).dataset.step as Step | undefined;
          if (!step) continue;
          if (entry.isIntersecting) setActive(step);
          else {
            const next = stepAtMiddle(root.current);
            if (next) setActive((cur) => (cur === step ? next : cur));
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    root.current?.querySelectorAll("[data-step]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [steps]);

  const model = useMemo(() => buildField(file), [file]);
  const contracts = useMemo(() => new Map(file.contracts.map((c) => [c.id, c])), [file]);
  const targets = useMemo(() => new Map(setup.targets.map((x) => [x.id, x])), [setup]);
  const docs = useMemo(() => new Map(setup.documents.map((d) => [d.id, d])), [setup]);
  const lensSpec = setup.lenses.find((l) => l.id === lens) ?? setup.lenses[0] ?? null;
  const lensKey = (lensSpec?.id ?? "globe") as LensKey;
  const rows = useMemo(
    () => (lensSpec ? areaRows(file.contracts, lensKey, lensSpec.categories, lensSpec.primary, setup.targets.map((x) => x.id)) : []),
    [file, lensSpec, lensKey, setup],
  );
  const places = useMemo(() => placeRows(file.contracts), [file]);
  const principal = useMemo(() => tierTotals(file, "principal"), [file]);
  const significant = useMemo(() => tierTotals(file, "significant"), [file]);
  const ctx = useMemo(() => ({ rows, places, geo }), [rows, places, geo]);
  const stage = useMemo<Stage>(() => (active === "areas" ? { kind: "areas", lens: lensKey } : { kind: active }), [active, lensKey]);
  const areaF = useMemo(() => areaFinding(rows, setup.targets.length, principal.value), [rows, setup.targets.length, principal.value]);
  const placeF = useMemo(() => placeFinding(places, principal.value), [places, principal.value]);

  const [pickedArea, setPickedArea] = useState<string | null>(null);
  const [pickedPlace, setPickedPlace] = useState<string | null>(null);
  const areaInView = pickedArea && rows.some((r) => r.id === pickedArea) ? pickedArea : null;
  const areaInFocus = areaInView ?? areaF.gap?.row.id ?? areaF.top?.row.id ?? null;
  const placeInFocus = pickedPlace ?? placeF?.first.id ?? null;

  const areaName = (id: string) => (id === NO_AREA ? t("areas.none") : (rows.find((r) => r.id === id)?.name ?? id));
  const placeName = (code: string) => geo?.features.find((f) => f.code === code)?.name ?? code;
  const areaOf = (c: Contract) => {
    const a = c.areas[lensKey];
    return a && rows.some((r) => r.id === a) ? a : NO_AREA;
  };
  const largest = (keep: (c: Contract) => boolean) =>
    file.contracts
      .filter((c) => c.tier === "principal" && keep(c))
      .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
      .slice(0, LIST_MAX);
  const areaList = areaInFocus ? largest((c) => areaOf(c) === areaInFocus) : [];
  const placeList = placeInFocus ? largest((c) => placeKey(c) === placeInFocus) : [];

  const census = file.census;
  const rate = file.source.usdRate;
  const pct1 = (share: number) => format.number(share, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const label = (l: FieldLabel): ReactNode => {
    const v = l.values;
    switch (l.kind) {
      case "year":
        return String(v.year);
      case "columnValue":
        return format.number(Number(v.value) / 1e12, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      case "columnShare":
        return pct1(Number(v.share));
      case "rowName":
        return areaName(String(v.id));
      case "rowTargets":
        return t("areas.targets", { count: Number(v.count) });
      case "rowValue":
        return Number(v.value) > 0 ? m.tugrik(Number(v.value)) : null;
      case "place":
        return `${String(v.name)} · ${m.tugrik(Number(v.value))}`;
      case "noPlace":
        return t("places.noPlace", { value: m.tugrik(Number(v.value)) });
    }
  };

  const tip = (p: FieldPoint): ReactNode => {
    if (p.kind === "row") return null;
    if (p.kind === "target") {
      const x = targets.get(p.id);
      if (!x) return null;
      return (
        <>
          <span className="ct-tip-meta">{docs.get(x.doc)?.name ?? x.doc}</span>
          <span className="ct-tip-title">{targetLine(x, 110)}</span>
        </>
      );
    }
    if (p.kind === "place") {
      const r = places.find((q) => q.id === p.code);
      return (
        <>
          <span className="ct-tip-title">{placeName(p.code)}</span>
          {r && (
            <span className="ct-tip-meta">{t("tip.place", { count: r.principal.contracts, value: m.tugrik(r.principal.value) })}</span>
          )}
        </>
      );
    }
    const main = p.slice?.main ? contracts.get(p.slice.main) : undefined;
    if (stage.kind === "record" || p.ink === "rest" || !main) {
      const y = file.years.find((q) => q.year === p.year);
      if (!y) return null;
      const thin = file.years.length > 2 && (p.year === file.years[0].year || p.year === file.years[file.years.length - 1].year);
      return (
        <>
          <span className="ct-tip-title">{t("tip.year", { year: y.year, count: m.n(y.contracts), value: m.tugrik(y.value) })}</span>
          {thin && <span className="ct-tip-meta">{t("tip.partial")}</span>}
        </>
      );
    }
    return (
      <>
        <span className="ct-tip-title">
          {main.title}
          {!main.translated && <span className="ct-tip-note"> ({t("tip.untranslated")})</span>}
        </span>
        <span className="ct-tip-meta">
          {m.tugrik(main.value)} · {main.year}
        </span>
        {p.slice && p.slice.parts > 1 && <span className="ct-tip-meta">{t("tip.more", { count: p.slice.parts - 1 })}</span>}
      </>
    );
  };

  const onSelect = (p: FieldPoint) => {
    if (p.kind === "square") {
      if (stage.kind !== "record" && p.ink !== "rest" && p.slice?.main) onContract(p.slice.main);
    } else if (p.kind === "target") onTarget(p.id);
    else if (p.kind === "row") setPickedArea((cur) => (cur === p.id ? null : p.id));
    else if (p.kind === "place") setPickedPlace((cur) => (cur === p.code ? null : p.code));
  };

  const contractRows = (list: Contract[]) => (
    <ul className="ct-list">
      {list.map((c) => (
        <li key={c.id}>
          <button type="button" className="ct-list-row" onClick={() => onContract(c.id)}>
            <span className="ct-list-title">{c.title}</span>
            <span className="ct-list-meta">
              {m.tugrik(c.value)} · {c.year}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  const areasHeadline = areaF.gap
    ? t("areas.headline", {
        area: areaF.gap.row.name,
        targets: m.n(areaF.gap.row.targets.length),
        total: m.n(setup.targets.length),
        pct: m.pct(areaF.gap.moneyShare),
      })
    : areaF.top
      ? t("areas.headlineTop", { area: areaF.top.row.name, pct: m.pct(areaF.top.moneyShare), targets: areaF.top.row.targets.length })
      : t("areas.headlineEmpty");
  const noPlaceShare = (() => {
    const rest = places.find((r) => r.id === NO_PLACE);
    return rest && principal.value > 0 ? rest.principal.value / principal.value : 0;
  })();

  return (
    <div className="brief-hub ct-overview" ref={root}>
      <div className="brief-hub-stage ct-stage">
        <SetLine file={file} stage={stage} />
        {stage.kind === "record" && <span className="ct-unit">{t("field.unit")}</span>}
        <MoneyField
          model={model}
          file={file}
          stage={stage}
          ctx={ctx}
          ariaLabel={t("field.label")}
          label={label}
          tip={tip}
          onSelect={onSelect}
          selected={stage.kind === "areas" ? areaInFocus : stage.kind === "places" ? placeInFocus : null}
        />
      </div>
      <div className="brief-hub-steps">
        <section className="brief-hub-step ct-step" data-step="record">
          <p className="brief-hub-kicker">{t("kicker.record")}</p>
          <h2 className="brief-hub-headline" tabIndex={-1}>
            {t("record.headline", { value: m.tugrik(census.value), count: m.n(census.contracts), year: file.source.firstYear })}
          </h2>
          <p className="brief-hub-second">{t("record.second", { usd: m.usd(census.value, rate) })}</p>
          {file.example && (
            <button type="button" className="ct-link" onClick={() => onContract(file.example!)}>
              {t("record.example")}
              <span aria-hidden="true"> ›</span>
            </button>
          )}
          <p className="ct-source">
            {t("record.source", { name: file.source.name, first: file.source.firstYear, last: m.month(file.source.snapshot) })}
          </p>
        </section>

        <section className="brief-hub-step ct-step" data-step="purpose">
          <p className="brief-hub-kicker">{t("kicker.purpose")}</p>
          <h2 className="brief-hub-headline" tabIndex={-1}>
            {t("purpose.headline", { per100: m.per100(census.value > 0 ? principal.value / census.value : 0) })}
          </h2>
          <p className="brief-hub-second">
            {t("purpose.second", { per100: m.per100(census.value > 0 ? significant.value / census.value : 0) })}
          </p>
          <p className="ct-tag">{t("purpose.tag")}</p>
        </section>

        <section className="brief-hub-step ct-step" data-step="areas">
          <p className="brief-hub-kicker">{t("kicker.areas")}</p>
          <div className="ct-lens" role="group" aria-label={t("areas.lens")}>
            {setup.lenses.map((l) => (
              <button
                key={l.id}
                type="button"
                className="ct-lens-option"
                aria-pressed={l.id === lensKey}
                onClick={() => onLens(l.id as LensKey)}
              >
                {tl(l.id)}
              </button>
            ))}
          </div>
          <h2 className="brief-hub-headline" tabIndex={-1}>
            {areasHeadline}
          </h2>
          {areaF.gap && areaF.top && areaF.top.row.id !== areaF.gap.row.id && (
            <p className="brief-hub-second">
              {t("areas.second", { area: areaF.top.row.name, pct: m.pct(areaF.top.moneyShare), targets: areaF.top.row.targets.length })}
            </p>
          )}
          {areaInFocus && areaList.length > 0 && (
            <>
              <h3 className="brief-hub-sub" data-lit={areaInView ? "" : undefined}>
                {t("areas.largest", { area: areaName(areaInFocus) })}
              </h3>
              {contractRows(areaList)}
            </>
          )}
        </section>

        {geo && (
          <section className="brief-hub-step ct-step" data-step="places">
            <p className="brief-hub-kicker">{t("kicker.places")}</p>
            <h2 className="brief-hub-headline" tabIndex={-1}>
              {placeF
                ? placeF.second
                  ? t("places.headline", {
                      place: placeName(placeF.first.id),
                      pct: m.pct(placeF.first.share),
                      second: placeName(placeF.second.id),
                      pct2: m.pct(placeF.second.share),
                    })
                  : t("places.headlineOne", { place: placeName(placeF.first.id), pct: m.pct(placeF.first.share) })
                : t("areas.headlineEmpty")}
            </h2>
            {noPlaceShare > 0 && <p className="brief-hub-second">{t("places.second", { pct: m.pct(noPlaceShare) })}</p>}
            {placeInFocus && placeList.length > 0 && (
              <>
                <h3 className="brief-hub-sub" data-lit={pickedPlace ? "" : undefined}>
                  {t("places.largest", { place: placeInFocus === NO_PLACE ? t("places.none") : placeName(placeInFocus) })}
                </h3>
                {contractRows(placeList)}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
