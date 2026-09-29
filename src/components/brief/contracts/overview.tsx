"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  alsoServed,
  areaSynergy,
  areaTargetCounts,
  fullYears,
  mapFinding,
  moneyByPlace,
  rateFinding,
  squaresOf,
  statOf,
  targetStats,
  tenderFinding,
  tenders,
  unitFor,
  yearFocus,
  type TenderDot,
} from "@/lib/brief/contracts/angles";
import { MIN_GAP, MIN_TARGET_SHARE, NO_AREA } from "@/lib/brief/contracts/areas";
import { buildField, type AreaRowB, type FieldLabel, type LabelSize, type LayoutContext, type OverlaySpec, type Stage } from "@/lib/brief/contracts/field";
import {
  contractArea,
  contractInFocus,
  focusContext,
  hasFocus,
  targetArea,
  targetInFocus,
  type Focus,
  type FocusParts,
} from "@/lib/brief/contracts/focus";
import type { GeoFile } from "@/lib/brief/contracts/geo";
import { NO_PLACE, type Contract, type LensKey } from "@/lib/brief/contracts/model";
import type { ContractsSetup } from "@/lib/brief/contracts/setup";
import { largestRemainder, squaresFor, UNIT } from "@/lib/brief/contracts/units";
import { targetLine } from "@/lib/brief/text";
import { MoneyField, type FieldPoint } from "./money-field";
import { useMoney } from "./money";
import { SetLine } from "./set-line";

export type Step = "record" | "purpose" | "places" | "areas";

/** What the map shows. */
export type MapLayer = "money" | "match" | "mis";

/** A list of contracts opened in a panel. */
export interface ContractList {
  title: string;
  ids: string[];
}

/** Places listed before "Show more"; an area's targets listed. */
const LIST_MAX = 8;
/** A place's targets and tenders, kept short so the step stays beside its map. */
const PLACE_TARGETS = 5;
const PLACE_TENDERS = 4;
/** Contracts serving targets in this many documents or more serve many at once. */
const MANY_DOCS = 3;
/** An area's synergy share is stated from this many contracts. */
const SYNERGY_MIN = 20;

/** The step across the middle of the window, if any. */
function stepAtMiddle(root: HTMLElement | null): Step | null {
  const y = window.innerHeight / 2;
  for (const el of root?.querySelectorAll<HTMLElement>("[data-step]") ?? []) {
    const box = el.getBoundingClientRect();
    if (box.top <= y && box.bottom >= y) return el.dataset.step as Step;
  }
  return null;
}

const byValue = (a: Contract, b: Contract) => b.value - a.value || a.id.localeCompare(b.id);

/**
 * The overview: the whole public contract record as squares of equal money
 * beside four steps, each a level deeper. The record by year; its share for
 * nature or climate; where it lands on the map; and what it is for, by
 * policy area beside the areas' targets. The squares re-form as each step
 * crosses the middle of the window. The page's focus (a policy area, a
 * document, a place) is answered by every step, and chosen in the steps.
 */
export function Overview({
  setup,
  geo,
  focus,
  onFocus,
  onContract,
  onTarget,
  onList,
  initialStep = "record",
}: {
  setup: ContractsSetup;
  geo: GeoFile | null;
  focus: Focus;
  onFocus: (patch: Partial<Focus>) => void;
  onContract: (id: string) => void;
  onTarget: (id: string) => void;
  onList: (list: ContractList) => void;
  /** The step that leads before the reader scrolls (tests, deep links). */
  initialStep?: Step;
}) {
  const t = useTranslations("brief.contracts");
  const tl = useTranslations("briefing.lens");
  const format = useFormatter();
  const m = useMoney();
  const file = setup.file;
  const steps = useMemo<Step[]>(() => (geo ? ["record", "purpose", "places", "areas"] : ["record", "purpose", "areas"]), [geo]);
  const [active, setActive] = useState<Step>(initialStep);
  const [layer, setLayer] = useState<MapLayer>("money");
  const [all, setAll] = useState(false);
  const [more, setMore] = useState(false);
  const [pointed, setPointed] = useState<string | null>(null);
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

  // ── The focus, as each step reads it ───────────────────────────────
  const model = useMemo(() => buildField(file), [file]);
  const contracts = useMemo(() => new Map(file.contracts.map((c) => [c.id, c])), [file]);
  const targetsById = useMemo(() => new Map(setup.targets.map((x) => [x.id, x])), [setup]);
  const docs = useMemo(() => new Map(setup.documents.map((d) => [d.id, d])), [setup]);
  const docOf = useMemo(() => new Map(setup.targets.map((x) => [x.id, x.doc])), [setup]);
  const lensSpec = setup.lenses.find((l) => l.id === focus.lens) ?? setup.lenses[0] ?? null;
  const lensKey = (lensSpec?.id ?? "globe") as LensKey;
  const fctx = useMemo(
    () => focusContext({ docOf, categories: lensSpec?.categories ?? [], primary: lensSpec?.primary ?? {} }),
    [docOf, lensSpec],
  );
  const keep = useMemo(() => (parts: FocusParts) => (c: Contract) => contractInFocus(c, focus, fctx, parts), [focus, fctx]);
  const areaName = (id: string) => (id === NO_AREA ? t("areas.none") : (lensSpec?.categories.find((c) => c.id === id)?.name ?? id));
  const placeName = (code: string) => (code === NO_PLACE ? t("places.noPlace") : (geo?.features.find((f) => f.code === code)?.name ?? code));
  const docCode = (id: string) => docs.get(id)?.code ?? id;
  const capital = geo?.band?.[0] ?? null;
  const anyFocus = hasFocus(focus);
  const mapFocused = focus.area !== null || focus.doc !== null;

  /** "Money for Restoration, strongly matching Res. 91 targets, in Govi-Altai". */
  const areaPart = (id: string) => (id === NO_AREA ? t("focus.noArea") : t("focus.area", { area: areaName(id) }));
  const focusName = () => {
    const parts: string[] = [];
    if (focus.area !== null) parts.push(areaPart(focus.area));
    if (focus.doc !== null) parts.push(t("focus.doc", { doc: docCode(focus.doc) }));
    if (focus.place !== null) parts.push(t("focus.place", { place: placeName(focus.place) }));
    return t("focus.name", { parts: parts.join(", ") });
  };
  /** The same focus as a phrase after "the money": "for Restoration, strongly matching …". */
  const focusPhrase = () =>
    [focus.area !== null ? areaPart(focus.area) : null, focus.doc !== null ? t("focus.doc", { doc: docCode(focus.doc) }) : null]
      .filter(Boolean)
      .join(", ");
  /** Which targets: "a target", "Res. 91 targets", "Restoration targets", "Res. 91 targets in Restoration". */
  const whatTargets = () => {
    const doc = focus.doc !== null ? docCode(focus.doc) : null;
    if (focus.area === NO_AREA) return doc ? t("places.what.bothNoArea", { doc }) : t("places.what.noArea");
    const area = focus.area !== null ? areaName(focus.area) : null;
    return doc && area ? t("places.what.both", { doc, area }) : doc ? t("places.what.doc", { doc }) : area ? t("places.what.area", { area }) : t("places.what.target");
  };
  /** "Focus: Restoration · Document C · Khovd", in each step the focus shapes. */
  const focusNote = anyFocus
    ? t("focus.note", {
        parts: [
          focus.area !== null ? areaName(focus.area) : null,
          focus.doc !== null ? (docs.get(focus.doc)?.name ?? focus.doc) : null,
          focus.place !== null ? placeName(focus.place) : null,
        ]
          .filter(Boolean)
          .join(" · "),
      })
    : null;

  // ── Step 2: the years ──────────────────────────────────────────────
  const yearValues = useMemo(() => (anyFocus ? yearFocus(file.contracts, keep({ area: true, doc: true, place: true })) : null), [anyFocus, file, keep]);
  const yearCtx = useMemo(() => {
    if (!yearValues) return null;
    const values = file.years.map((y) => yearValues.get(y.year) ?? 0);
    const total = values.reduce((s, v) => s + v, 0);
    return { squares: largestRemainder(values, squaresFor(total)), values };
  }, [yearValues, file]);
  const full = useMemo(() => fullYears(file.years), [file]);

  // ── Step 3: the map ────────────────────────────────────────────────
  const principalByPlace = useMemo(() => moneyByPlace(file.contracts, () => true), [file]);
  const rates = useMemo(() => (file.places ? rateFinding(file.places, principalByPlace) : null), [file, principalByPlace]);
  const showAll = all && layer === "money" && !mapFocused && !!file.places;
  const focusMoney = useMemo(() => (mapFocused ? moneyByPlace(file.contracts, keep({ area: true, doc: true })) : null), [mapFocused, file, keep]);
  const keepTarget = useMemo(() => (id: string) => targetInFocus(id, focus, fctx, { area: true, doc: true }), [focus, fctx]);
  const tenderList = useMemo<TenderDot[] | null>(() => (layer === "money" ? null : tenders(file.contracts, layer, keepTarget)), [layer, file, keepTarget]);
  const allMatch = useMemo(() => (layer === "match" && mapFocused ? tenders(file.contracts, "match", () => true) : null), [layer, mapFocused, file]);
  const placeCodes = useMemo(() => [...(geo?.features.map((f) => f.code) ?? []), NO_PLACE], [geo]);
  const mapOverlay = useMemo<OverlaySpec | null>(() => {
    if (tenderList) {
      const by = new Map<string, number>();
      for (const d of tenderList) by.set(d.place, (by.get(d.place) ?? 0) + 1);
      return { shape: "dot", ink: layer === "mis" ? "mis" : "match", unit: 1, cells: placeCodes.map((id) => ({ id, n: by.get(id) ?? 0 })) };
    }
    if (focusMoney) {
      const total = [...focusMoney.values()].reduce((s, v) => s + v, 0);
      const unit = unitFor(total);
      const n = largestRemainder(placeCodes.map((c) => focusMoney.get(c) ?? 0), squaresOf(total, unit));
      return { shape: "square", ink: "principal", unit, cells: placeCodes.map((id, i) => ({ id, n: n[i] })) };
    }
    return null;
  }, [tenderList, focusMoney, placeCodes, layer]);

  /** The measure the map and its list show for a place, in this layer. */
  const placeValue = (code: string): number => {
    if (tenderList) return tenderList.filter((d) => d.place === code).length;
    if (showAll) return file.places?.find((p) => p.code === code)?.value ?? 0;
    if (focusMoney) return focusMoney.get(code) ?? 0;
    if (!rates) return principalByPlace.get(code) ?? 0;
    return rates.rates.get(code) ?? 0;
  };
  const placeValueText = (code: string): string => {
    if (tenderList) return t("places.tenders", { count: placeValue(code) });
    if (showAll || focusMoney || !rates) return m.amount(placeValue(code));
    return t("places.perHundred", { sign: m.sign, per100: m.per100(rates.rates.get(code) ?? 0) });
  };

  // ── Step 4: the policy areas ───────────────────────────────────────
  const stats = useMemo(() => targetStats(file.contracts, keep({ place: true })), [file, keep]);
  const areaMoney = useMemo(() => {
    const out = new Map<string, { value: number; ids: string[] }>();
    for (const c of file.contracts) {
      if (c.tier !== "principal" || !keep({ doc: true, place: true })(c)) continue;
      const a = contractArea(c, lensKey, fctx);
      const r = out.get(a) ?? { value: 0, ids: [] };
      r.value += c.value;
      r.ids.push(c.id);
      out.set(a, r);
    }
    const value = new Map(file.contracts.map((c) => [c.id, c.value]));
    for (const r of out.values()) r.ids.sort((x, y) => (value.get(y) ?? 0) - (value.get(x) ?? 0) || x.localeCompare(y));
    return out;
  }, [file, keep, lensKey, fctx]);
  const rows = useMemo<AreaRowB[]>(() => {
    const targetsBy = new Map<string, string[]>();
    for (const x of setup.targets) {
      if (focus.doc !== null && x.doc !== focus.doc) continue;
      const a = targetArea(x.id, fctx);
      targetsBy.set(a, [...(targetsBy.get(a) ?? []), x.id]);
    }
    const ids = [...(lensSpec?.categories.map((c) => c.id) ?? []), NO_AREA];
    return ids
      .map((id) => ({
        id,
        name: id === NO_AREA ? "" : (lensSpec?.categories.find((c) => c.id === id)?.name ?? id),
        value: areaMoney.get(id)?.value ?? 0,
        targets: (targetsBy.get(id) ?? []).map((x) => ({ id: x, matched: statOf(stats, x).match.size > 0 })),
      }))
      .filter((r) => r.value > 0 || r.targets.length > 0)
      .sort((a, b) => Number(a.id === NO_AREA) - Number(b.id === NO_AREA) || b.value - a.value || b.targets.length - a.targets.length || a.id.localeCompare(b.id));
  }, [setup, focus.doc, fctx, lensSpec, areaMoney, stats]);
  const areaOverlay = useMemo<OverlaySpec | null>(() => {
    if (focus.doc === null && focus.place === null) return null;
    const total = rows.reduce((s, r) => s + r.value, 0);
    const unit = unitFor(total);
    const n = largestRemainder(rows.map((r) => r.value), squaresOf(total, unit));
    return { shape: "square", ink: "principal", unit, cells: rows.map((r, i) => ({ id: r.id, n: n[i] })) };
  }, [focus.doc, focus.place, rows]);

  // ── The field ──────────────────────────────────────────────────────
  const stage = useMemo<Stage>(() => {
    if (active === "purpose") return { kind: "purpose", key: `${focus.lens}|${focus.area}|${focus.doc}|${focus.place}` };
    if (active === "places") return { kind: "places", layer: showAll ? "all" : layer, key: `${layer}|${focus.lens}|${focus.area}|${focus.doc}` };
    if (active === "areas") return { kind: "areas", lens: lensKey, key: `${focus.doc}|${focus.place}` };
    return { kind: "record" };
  }, [active, focus.lens, focus.area, focus.doc, focus.place, showAll, layer, lensKey]);
  const nameSizes = useMemo(() => {
    const sizes = new Map<string, LabelSize>();
    for (const code of placeCodes) {
      const name = placeName(code);
      const value = placeValueText(code);
      sizes.set(code, {
        w: Math.max(name.length * 6.4, value.length * 5.6) + 6,
        h: 27,
        line: name.length * 6.8 + value.length * 6.1 + 22,
        name: name.length * 6.8 + 8,
      });
    }
    return sizes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeCodes, tenderList, focusMoney, showAll, rates, m.currency]);
  const ctx = useMemo<LayoutContext>(() => {
    if (stage.kind === "purpose") return { yearFocus: yearCtx };
    if (stage.kind === "places") return { geo, overlay: mapOverlay, labelSize: (code) => nameSizes.get(code) ?? { w: 72, h: 27, line: 180, name: 90 } };
    if (stage.kind === "areas") return { rows, overlay: areaOverlay };
    return {};
  }, [stage.kind, yearCtx, geo, mapOverlay, nameSizes, rows, areaOverlay]);

  const pct1 = (share: number) => format.number(share, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const label = (l: FieldLabel): ReactNode => {
    const v = l.values;
    switch (l.kind) {
      case "year":
        return String(v.year);
      case "columnValue":
        return m.column(Number(v.value));
      case "columnShare":
        return pct1(Number(v.share));
      case "columnFocus":
        return format.number(m.currency === "usd" ? Number(v.value) / setup.file.source.usdRate / 1e6 : Number(v.value) / 1e9, { maximumFractionDigits: 1 });
      case "unit":
        if (v.of === "years") return t(m.currency === "usd" ? "field.unitFocusUsd" : "field.unitFocusMnt");
        return v.shape === "dot" ? t("field.unitDot") : t("field.unitSquare", { value: m.amount(Number(v.unit)) });
      case "head":
        return v.col === "money" ? t("areas.headMoney") : focus.doc !== null ? t("areas.headTargetsOf", { doc: docCode(focus.doc) }) : t("areas.headTargets");
      case "rowName":
        return areaName(String(v.id));
      case "rowTargets":
        return format.number(Number(v.count));
      case "rowValue":
        return m.amount(Number(v.value));
      case "place":
        return (
          <>
            {placeName(String(v.code))}
            <small>{placeValueText(String(v.code))}</small>
          </>
        );
      case "band":
        return v.short ? (
          placeName(String(v.code))
        ) : (
          <>
            {placeName(String(v.code))}
            <small> · {placeValueText(String(v.code))}</small>
          </>
        );
    }
  };

  const tip = (p: FieldPoint): ReactNode => {
    if (p.kind === "row") return null;
    if (p.kind === "target") {
      const x = targetsById.get(p.id);
      if (!x) return null;
      const s = statOf(stats, p.id);
      return (
        <>
          <span className="ct-tip-meta">{docs.get(x.doc)?.name ?? x.doc}</span>
          <span className="ct-tip-title">{targetLine(x, 110)}</span>
          <span className="ct-tip-meta">
            {s.matchContracts > 0 ? t("tip.targetMatched", { count: s.matchContracts }) : t("tip.targetNone")}
            {s.mis.size > 0 ? ` · ${t("tip.targetMis", { count: s.mis.size })}` : ""}
          </span>
        </>
      );
    }
    if (p.kind === "mark") {
      const r = rows.find((q) => q.id === p.cell);
      return r ? <span className="ct-tip-title">{t("tip.row", { name: areaName(r.id), value: m.amount(r.value), count: areaMoney.get(r.id)?.ids.length ?? 0 })}</span> : null;
    }
    if (p.kind === "place") {
      const total = file.places?.find((q) => q.code === p.code);
      return (
        <>
          <span className="ct-tip-title">{placeName(p.code)}</span>
          {total && <span className="ct-tip-meta">{t("places.tipAll", { value: m.amount(total.value), count: total.contracts })}</span>}
          {rates && !tenderList && (
            <span className="ct-tip-meta">
              {t("places.tipGreen", { value: m.amount(principalByPlace.get(p.code) ?? 0), sign: m.sign, per100: m.per100(rates.rates.get(p.code) ?? 0) })}
            </span>
          )}
          {focusMoney && !tenderList && <span className="ct-tip-meta">{t("places.tipFocus", { value: m.amount(focusMoney.get(p.code) ?? 0), focus: focusPhrase() })}</span>}
          {tenderList && (
            <span className="ct-tip-meta">
              {t("places.tipTenders", { count: placeValue(p.code), kind: layer, what: whatTargets() })}
            </span>
          )}
        </>
      );
    }
    const main = p.slice?.main ? contracts.get(p.slice.main) : undefined;
    if (stage.kind === "record" || stage.kind === "purpose" || p.ink === "rest" || !main) {
      const y = file.years.find((q) => q.year === p.year);
      if (!y) return null;
      const thin = file.years.length > 2 && (p.year === file.years[0].year || p.year === file.years[file.years.length - 1].year);
      return (
        <>
          <span className="ct-tip-title">{t("tip.year", { year: y.year, count: m.n(y.contracts), value: m.amount(y.value) })}</span>
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
          {m.amount(main.value)} · {main.year}
        </span>
        {p.slice && p.slice.parts > 1 && <span className="ct-tip-meta">{t("tip.more", { count: p.slice.parts - 1 })}</span>}
      </>
    );
  };

  const onSelect = (p: FieldPoint) => {
    if (p.kind === "square") {
      if (stage.kind !== "record" && p.ink !== "rest" && p.slice?.main) onContract(p.slice.main);
    } else if (p.kind === "target") onTarget(p.id);
    else if (p.kind === "place") onFocus({ place: focus.place === p.code ? null : p.code });
    else if (p.kind === "row" || p.kind === "mark") {
      const id = p.kind === "row" ? p.id : p.cell;
      onFocus({ area: focus.area === id ? null : id });
    }
  };
  const onPoint = (p: FieldPoint | null) => setPointed(p === null ? null : p.kind === "place" ? p.code : p.kind === "row" ? p.id : p.kind === "mark" ? p.cell : null);

  const census = file.census;
  const principalTotal = useMemo(() => file.years.reduce((s, y) => s + y.principal.value, 0), [file]);
  const significantTotal = useMemo(() => file.years.reduce((s, y) => s + y.significant.value, 0), [file]);

  return (
    <div className="brief-hub ct-overview" ref={root}>
      <div className="brief-hub-stage ct-stage">
        <SetLine file={file} stage={stage} />
        {stage.kind === "record" && <span className="ct-unit">{t(m.currency === "usd" ? "field.unitUsd" : "field.unitMnt")}</span>}
        {stage.kind === "places" && layer === "money" && file.places && !mapFocused && (
          <div className="ct-lens ct-switch" role="group" aria-label={t("places.switch")}>
            <button type="button" className="ct-lens-option" aria-pressed={!all} onClick={() => setAll(false)}>
              {t("places.switchMoney")}
            </button>
            <button type="button" className="ct-lens-option" aria-pressed={all} onClick={() => setAll(true)}>
              {t("places.switchAll")}
            </button>
          </div>
        )}
        <MoneyField
          model={model}
          file={file}
          stage={stage}
          ctx={ctx}
          ariaLabel={t("field.label", { unit: m.amount(UNIT) })}
          label={label}
          tip={tip}
          onSelect={onSelect}
          onPoint={onPoint}
          // Only a place or area in focus, or one pointed at, is marked: nothing at rest.
          selected={stage.kind === "areas" ? focus.area : stage.kind === "places" ? focus.place : null}
          pointed={pointed}
        />
      </div>
      <div className="brief-hub-steps">
        <section className="brief-hub-step ct-step" data-step="record">
          <p className="brief-hub-kicker">{t("kicker.record")}</p>
          <h2 className="brief-hub-headline" tabIndex={-1}>
            {t("record.headline", { value: m.amount(census.value), count: m.n(census.contracts), year: file.source.firstYear })}
          </h2>
          <p className="brief-hub-second">{t("record.second", { other: m.other(census.value) })}</p>
          {file.example && (
            <button type="button" className="ct-link" onClick={() => onContract(file.example!)}>
              {t("record.example")}
              <span aria-hidden="true"> ›</span>
            </button>
          )}
          <p className="ct-source">{t("record.source", { name: file.source.name, first: file.source.firstYear, last: m.month(file.source.snapshot) })}</p>
        </section>

        <section className="brief-hub-step ct-step" data-step="purpose">
          <p className="brief-hub-kicker">{t("kicker.purpose")}</p>
          {focusNote && <p className="ct-focus-note">{focusNote}</p>}
          <h2 className="brief-hub-headline" tabIndex={-1}>
            {t("purpose.headline", { sign: m.sign, per100: m.per100(census.value > 0 ? principalTotal / census.value : 0) })}
          </h2>
          <p className="brief-hub-second">{t("purpose.second", { sign: m.sign, per100: m.per100(census.value > 0 ? significantTotal / census.value : 0) })}</p>
          {yearValues && full.length >= 2 && (
            <p className="brief-hub-second ct-focus-line">
              {t("purpose.focusLine", {
                name: focusName(),
                first: m.amount(yearValues.get(full[0]) ?? 0),
                firstYear: full[0],
                last: m.amount(yearValues.get(full[full.length - 1]) ?? 0),
                lastYear: full[full.length - 1],
              })}
            </p>
          )}
          <p className="ct-tag">{t("purpose.tag")}</p>
          <LensChoices setup={setup} focus={focus} onFocus={onFocus} label={t("areas.lens")} />
          <AreaMoneyList
            rows={rows}
            label={t("purpose.byArea")}
            areaName={areaName}
            amount={m.amount}
            focusArea={focus.area}
            pointed={pointed}
            onPoint={setPointed}
            onPick={(id) => onFocus({ area: focus.area === id ? null : id })}
          />
        </section>

        {geo && (
          <section className="brief-hub-step ct-step" data-step="places">
            <PlacesSide
              {...{ t, m, setup, geo, focus, onFocus, onList, onTarget, layer, setLayer, showAll, capital, rates, principalByPlace, focusMoney, tenderList, allMatch, keep, docOf, fctx, lensKey, placeName, areaName, docCode, focusPhrase, whatTargets, placeValue, placeValueText, more, setMore, pointed, setPointed, focusNote, targetsById }}
            />
          </section>
        )}

        <section className="brief-hub-step ct-step" data-step="areas">
          <AreasSide {...{ t, tl, m, setup, focus, onFocus, onList, onTarget, rows, stats, areaMoney, lensKey, fctx, docOf, areaName, docCode, placeName, pointed, setPointed, targetsById, focusNote }} />
        </section>
      </div>
    </div>
  );
}

type T = ReturnType<typeof useTranslations<"brief.contracts">>;
type M = ReturnType<typeof useMoney>;

/** The map's right side: what it shows, the focus choices, the finding, and
 *  the places (or the one in focus). */
function PlacesSide(props: {
  t: T;
  m: M;
  setup: ContractsSetup;
  geo: GeoFile;
  focus: Focus;
  onFocus: (patch: Partial<Focus>) => void;
  onList: (list: ContractList) => void;
  onTarget: (id: string) => void;
  layer: MapLayer;
  setLayer: (l: MapLayer) => void;
  showAll: boolean;
  capital: string | null;
  rates: ReturnType<typeof rateFinding> | null;
  principalByPlace: Map<string, number>;
  focusMoney: Map<string, number> | null;
  tenderList: TenderDot[] | null;
  allMatch: TenderDot[] | null;
  keep: (parts: FocusParts) => (c: Contract) => boolean;
  docOf: Map<string, string>;
  fctx: ReturnType<typeof focusContext>;
  lensKey: LensKey;
  placeName: (code: string) => string;
  areaName: (id: string) => string;
  docCode: (id: string) => string;
  focusPhrase: () => string;
  whatTargets: () => string;
  placeValue: (code: string) => number;
  placeValueText: (code: string) => string;
  more: boolean;
  setMore: (v: boolean) => void;
  pointed: string | null;
  setPointed: (v: string | null) => void;
  focusNote: string | null;
  targetsById: Map<string, { id: string; doc: string; label: string; text: string }>;
}) {
  const { t, m, setup, geo, focus, onFocus, onList, layer, setLayer, showAll, capital, rates, principalByPlace, focusMoney, tenderList, allMatch } = props;
  const file = setup.file;
  const lens = setup.lenses.find((l) => l.id === focus.lens) ?? setup.lenses[0];
  const tl = useTranslations("briefing.lens");
  const record = file.places ?? [];
  const recordTotal = record.reduce((s, p) => s + p.value, 0);
  const principalTotal = [...principalByPlace.values()].reduce((s, v) => s + v, 0);
  const mapFocused = focus.area !== null || focus.doc !== null;

  let headline: string;
  const lines: string[] = [];
  let tag: string | null = null;
  let also: ReactNode = null;
  if (tenderList && layer === "mis") {
    const f = tenderFinding(tenderList, null);
    headline = f.total
      ? t("places.headlineMis", { none: f.none, count: f.total, with: mapFocused ? t("places.misWith", { what: props.whatTargets() }) : "", placed: f.placed })
      : t("places.headlineMisEmpty", { what: props.whatTargets() });
    if (f.total) lines.push(t("places.secondMis", { none: f.none, placed: f.placed, noneValue: m.amount(f.noneValue), placedValue: m.amount(f.placedValue) }));
    if (f.total) tag = t("places.tagMis");
  } else if (tenderList) {
    const f = tenderFinding(tenderList, allMatch);
    if (!f.total) headline = t("places.headlineMatchEmpty", { what: props.whatTargets() });
    else if (f.over)
      headline = t("places.headlineMatchOver", { place: props.placeName(f.over.code), share: m.pct(f.over.share), count: f.total, what: props.whatTargets(), base: m.pct(f.over.baseShare) });
    else if (f.top)
      headline = t("places.headlineMatch", {
        count: f.total,
        what: mapFocused ? props.whatTargets() : t("places.what.target"),
        pctNone: m.pct(f.noneShare),
        pctTop: m.pct(f.top.share),
        top: props.placeName(f.top.code),
      });
    else headline = t("places.headlineMatchUnplaced", { count: f.total, what: mapFocused ? props.whatTargets() : t("places.what.target"), pctNone: m.pct(f.noneShare) });
    if (f.total) tag = t("places.tagMatch");
  } else if (showAll) {
    const ub = record.find((p) => p.code === capital)?.value ?? 0;
    const none = record.find((p) => p.code === NO_PLACE)?.value ?? 0;
    headline = t("places.headlineAll", { pct: m.pct(recordTotal ? ub / recordTotal : 0), capital: capital ? props.placeName(capital) : "", pctNone: m.pct(recordTotal ? none / recordTotal : 0) });
    lines.push(t("places.secondAll"));
  } else if (focusMoney) {
    const f = mapFinding(focusMoney, principalByPlace, file.contracts, props.keep({ area: true, doc: true }));
    if (!f.lead)
      headline = f.total > 0 ? t("places.headlineUnplaced", { pct: m.pct(f.noneShare), focus: props.focusPhrase() }) : t("places.headlineNone", { focus: props.focusPhrase() });
    else if (f.lead.over)
      headline = t("places.headlineOver", { place: props.placeName(f.lead.code), share: m.pct(f.lead.share), focus: props.focusPhrase(), base: m.pct(f.lead.baseShare) });
    else headline = t("places.headlineTop", { place: props.placeName(f.lead.code), share: m.pct(f.lead.share), focus: props.focusPhrase() });
    if (f.one) lines.push(t("places.one", { title: f.one.title, value: m.amount(f.one.value) }));
    if (f.noneShare >= 0.2) lines.push(t("places.noneShare", { pct: m.pct(f.noneShare) }));
    if (focus.doc !== null) {
      const s = alsoServed(file.contracts, focus.doc, props.docOf, props.keep({ area: true }));
      if (s.n > 0)
        also = (
          <>
            <p className="ct-sub">{t("places.also", { count: s.n })}</p>
            <p className="ct-codes">
              {s.shares.map((x) => (
                <span key={x.doc}>
                  <abbr title={setup.documents.find((d) => d.id === x.doc)?.name}>{props.docCode(x.doc)}</abbr> <b>{m.pct(x.share)}</b>
                </span>
              ))}
            </p>
            <p className="ct-more">{t("places.alone", { pct: m.pct(s.alone) })}</p>
          </>
        );
    }
  } else if (!rates) {
    const f = mapFinding(principalByPlace, principalByPlace, file.contracts, () => true);
    headline = f.lead ? t("places.headlineShare", { place: props.placeName(f.lead.code), pct: m.pct(f.lead.share) }) : t("areas.headlineEmpty");
  } else if (rates.top) {
    const ubGreen = capital ? (principalByPlace.get(capital) ?? 0) : 0;
    headline = t("places.headlineRate", { place: props.placeName(rates.top.code), sign: m.sign, per100: m.per100(rates.top.rate), overall: m.per100(rates.overall) });
    if (capital) lines.push(t("places.secondRate", { capital: props.placeName(capital), pct: m.pct(principalTotal ? ubGreen / principalTotal : 0), sign: m.sign, per100: m.per100(rates.rates.get(capital) ?? 0) }));
  } else headline = t("areas.headlineEmpty");

  // The places, ranked by what the map shows (the unnamed among them).
  const codes = [...geo.features.map((f) => f.code), NO_PLACE];
  const ranked = codes
    .map((code) => ({ code, v: props.placeValue(code) }))
    .filter((r) => r.v > 0 || (!tenderList && !focusMoney))
    .sort((a, b) => b.v - a.v || a.code.localeCompare(b.code));
  const maxV = Math.max(1e-12, ...ranked.map((r) => r.v));
  const shown = props.more ? ranked : ranked.slice(0, LIST_MAX);
  const barInk = tenderList ? (layer === "mis" ? "ct-bar-mis" : "ct-bar-match") : showAll ? "ct-bar-record" : "ct-bar-money";

  const picked = focus.place;
  const detail = (() => {
    if (!picked) return null;
    if (tenderList) {
      const mine = tenderList.filter((d) => d.place === picked).sort((a, b) => b.targets.length - a.targets.length || b.value - a.value);
      const perTarget = new Map<string, number>();
      for (const d of mine) for (const x of d.targets) perTarget.set(x, (perTarget.get(x) ?? 0) + 1);
      const topTargets = [...perTarget.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { numeric: true }));
      return (
        <>
          <p className="ct-pick-facts">
            {t("places.factsTenders", { count: mine.length, kind: layer, what: props.whatTargets(), value: m.amount(mine.reduce((s, d) => s + d.value, 0)) })}
          </p>
          {topTargets.length > 0 && (
            <TargetRows
              heading={layer === "mis" ? t("places.targetsMis") : t("places.targetsMatch")}
              rows={topTargets.slice(0, PLACE_TARGETS).map(([id, n]) => ({ id, count: t("places.targetTenders", { count: n }) }))}
              more={topTargets.length > PLACE_TARGETS ? t("places.andMore", { count: topTargets.length - PLACE_TARGETS }) : null}
              targetsById={props.targetsById}
              docCode={props.docCode}
              onTarget={props.onTarget}
            />
          )}
          <ul className="ct-tenders">
            {mine.slice(0, PLACE_TENDERS).map((d) => (
              <li key={d.tender} className="ct-tender-line">
                <span className="ct-tender-title">{d.lead.title}</span>
                <span className="ct-list-meta">{t("places.tenderLine", { contracts: d.lots.length, value: m.amount(d.value), year: d.lead.year, targets: d.targets.length })}</span>
              </li>
            ))}
          </ul>
          {mine.length > PLACE_TENDERS && <p className="ct-more">{t("places.andMore", { count: mine.length - PLACE_TENDERS })}</p>}
        </>
      );
    }
    const keepHere = (c: Contract) => c.tier === "principal" && (c.place && c.place !== "several" ? c.place : NO_PLACE) === picked && props.keep({ area: true, doc: true })(c);
    const mine = file.contracts.filter(keepHere).sort(byValue);
    const green = mine.reduce((s, c) => s + c.value, 0);
    const total = record.find((p) => p.code === picked);
    const byArea = new Map<string, number>();
    for (const c of mine) {
      const a = props.fctx.known.has(c.areas[props.lensKey] ?? "") ? c.areas[props.lensKey]! : NO_AREA;
      byArea.set(a, (byArea.get(a) ?? 0) + c.value);
    }
    const areas = [...byArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxA = Math.max(1, ...areas.map((a) => a[1]));
    const matched = new Map<string, Set<string>>();
    for (const c of mine) for (const x of c.matches) {
      const d = props.docOf.get(x);
      if (!d) continue;
      if (!matched.has(d)) matched.set(d, new Set());
      matched.get(d)!.add(x);
    }
    const nMatched = new Set(mine.flatMap((c) => c.matches)).size;
    const perTarget = new Map<string, number>();
    for (const c of mine) for (const x of c.matches) perTarget.set(x, (perTarget.get(x) ?? 0) + 1);
    const topTargets = [...perTarget.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { numeric: true }));
    return (
      <>
        <p className="ct-pick-facts">
          {mapFocused
            ? t("places.factsFocus", { all: m.amount(total?.value ?? 0), count: total?.contracts ?? 0, green: m.amount(green), greenCount: mine.length, focus: props.focusPhrase() })
            : t("places.facts", { all: m.amount(total?.value ?? 0), count: total?.contracts ?? 0, green: m.amount(green), greenCount: mine.length, sign: m.sign, per100: m.per100(rates?.rates.get(picked) ?? 0) })}
        </p>
        {areas.length > 0 && (
          <>
            <p className="ct-sub">{t("places.byArea", { lens: tl(lens?.id ?? "globe") })}</p>
            {areas.map(([a, v]) => (
              <div key={a} className="ct-mini">
                <span>{props.areaName(a)}</span>
                <span className="ct-mini-bar">
                  <i style={{ width: `${(v / maxA) * 100}%` }} />
                </span>
                <span className="ct-mini-num">{m.amount(v)}</span>
              </div>
            ))}
          </>
        )}
        {nMatched > 0 && (
          <>
            <p className="ct-sub">{t("places.matched", { count: nMatched })}</p>
            <p className="ct-codes">
              {setup.documents
                .filter((d) => matched.has(d.id))
                .map((d) => (
                  <span key={d.id}>
                    <abbr title={d.name}>{d.code}</abbr> <b>{matched.get(d.id)!.size}</b>
                  </span>
                ))}
            </p>
            <TargetRows
              heading={t("places.targetsMoney")}
              rows={topTargets.slice(0, PLACE_TARGETS).map(([id, n]) => ({ id, count: t("places.targetContracts", { count: n }) }))}
              more={null}
              targetsById={props.targetsById}
              docCode={props.docCode}
              onTarget={props.onTarget}
            />
          </>
        )}
        {mine.length > 0 && (
          <button type="button" className="ct-link" onClick={() => onList({ title: t("places.listTitle", { place: props.placeName(picked) }), ids: mine.map((c) => c.id) })}>
            {t("places.seeContracts", { count: mine.length })}
            <span aria-hidden="true"> ›</span>
          </button>
        )}
      </>
    );
  })();

  return (
    <>
      <p className="brief-hub-kicker">{t("kicker.places")}</p>
      {props.focusNote && <p className="ct-focus-note">{props.focusNote}</p>}
      <div className="ct-lens" role="group" aria-label={t("places.layers")}>
        {(["money", "match", "mis"] as const).map((l) => (
          <button key={l} type="button" className="ct-lens-option" aria-pressed={layer === l} onClick={() => setLayer(l)}>
            {t(`places.layer.${l}`)}
          </button>
        ))}
      </div>
      {!showAll && (
        <div className="ct-focus-choices">
          <LensChoices setup={setup} focus={focus} onFocus={onFocus} label={t("areas.lens")} small />
          <label className="ct-select-line">
            <span className="ct-choice-label">{t("places.area")}</span>
            <select value={focus.area ?? ""} onChange={(e) => onFocus({ area: e.target.value || null })}>
              <option value="">{t("places.areaAll")}</option>
              {lens?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NO_AREA}>{t("areas.none")}</option>
            </select>
          </label>
          <div className="ct-lens ct-docs-choice" role="group" aria-label={t("places.doc")}>
            <span className="ct-choice-label">{t("places.doc")}</span>
            <button type="button" className="ct-lens-option" aria-pressed={focus.doc === null} onClick={() => onFocus({ doc: null })}>
              {t("places.docAll")}
            </button>
            {setup.documents.map((d) => (
              <button key={d.id} type="button" className="ct-lens-option" aria-pressed={focus.doc === d.id} title={d.name} onClick={() => onFocus({ doc: d.id })}>
                {d.code}
              </button>
            ))}
          </div>
        </div>
      )}
      <h2 className="brief-hub-headline" tabIndex={-1}>
        {headline}
      </h2>
      {lines.length > 0 && <p className="brief-hub-second">{lines.join(" ")}</p>}
      {tag && <p className="ct-tag">{tag}</p>}
      {also}
      {picked ? (
        <div className="ct-pick">
          <button type="button" className="ct-back" onClick={() => onFocus({ place: null })}>
            ‹ {t("places.back")}
          </button>
          <h3 className="ct-pick-name" data-lit="">
            {props.placeName(picked)}
          </h3>
          {detail}
        </div>
      ) : (
        <>
          <ul className="ct-rank">
            {shown.map((r) => (
              <li key={r.code}>
                <button
                  type="button"
                  className="ct-rank-row"
                  data-lit={props.pointed === r.code ? "" : undefined}
                  onClick={() => onFocus({ place: r.code })}
                  onPointerEnter={() => props.setPointed(r.code)}
                  onPointerLeave={() => props.setPointed(null)}
                >
                  <span className="ct-rank-name">{props.placeName(r.code)}</span>
                  <span className={`ct-rank-bar ${barInk}`}>
                    <i style={{ width: `${(r.v / maxV) * 100}%` }} />
                  </span>
                  <span className="ct-rank-num">{props.placeValueText(r.code)}</span>
                </button>
              </li>
            ))}
          </ul>
          {ranked.length > LIST_MAX && (
            <button type="button" className="ct-back" onClick={() => props.setMore(!props.more)}>
              {props.more ? t("places.fewer") : t("places.more", { count: ranked.length - LIST_MAX })}
            </button>
          )}
        </>
      )}
    </>
  );
}

/** The policy areas' right side: the lens, the finding, every area's targets
 *  (potentially misaligned beside strongly matching), or the area in focus. */
function AreasSide(props: {
  t: T;
  tl: ReturnType<typeof useTranslations<"briefing.lens">>;
  m: M;
  setup: ContractsSetup;
  focus: Focus;
  onFocus: (patch: Partial<Focus>) => void;
  onList: (list: ContractList) => void;
  onTarget: (id: string) => void;
  rows: AreaRowB[];
  stats: ReturnType<typeof targetStats>;
  areaMoney: Map<string, { value: number; ids: string[] }>;
  lensKey: LensKey;
  fctx: ReturnType<typeof focusContext>;
  docOf: Map<string, string>;
  areaName: (id: string) => string;
  docCode: (id: string) => string;
  placeName: (code: string) => string;
  pointed: string | null;
  setPointed: (v: string | null) => void;
  targetsById: Map<string, { id: string; doc: string; label: string; text: string }>;
  focusNote: string | null;
}) {
  const { t, tl, m, setup, focus, onFocus, onList, rows, stats } = props;
  const file = setup.file;
  const totalTargets = rows.reduce((s, r) => s + r.targets.length, 0);
  const totalMoney = rows.reduce((s, r) => s + r.value, 0);
  let gap: { r: AreaRowB; ts: number; ms: number } | null = null;
  let top: { r: AreaRowB; ts: number; ms: number } | null = null;
  for (const r of rows) {
    if (r.id === NO_AREA) continue;
    const ts = totalTargets > 0 ? r.targets.length / totalTargets : 0;
    const ms = totalMoney > 0 ? r.value / totalMoney : 0;
    if (ts >= MIN_TARGET_SHARE && ts - ms >= MIN_GAP && (!gap || ts - ms > gap.ts - gap.ms)) gap = { r, ts, ms };
    if (r.value > 0 && (!top || ms > top.ms)) top = { r, ts, ms };
  }
  const targetsWord = focus.doc !== null ? t("areas.targetsOf", { doc: props.docCode(focus.doc) }) : t("areas.targetsAll");
  const inPlace = focus.place !== null ? t("areas.inPlace", { place: props.placeName(focus.place) }) : "";
  const headline = gap
    ? t("areas.headline", { area: props.areaName(gap.r.id), tshare: m.pct(gap.ts), targets: targetsWord, mshare: m.pct(gap.ms), place: inPlace })
    : top
      ? t("areas.headlineTop", { area: props.areaName(top.r.id), mshare: m.pct(top.ms), place: inPlace, tshare: m.pct(top.ts), targets: targetsWord })
      : t("areas.headlineEmpty");
  const sel = focus.area !== null ? rows.find((r) => r.id === focus.area) ?? null : null;

  const bf = (ids: string[], key: string, label: ReactNode, onClick?: () => void, title?: string) => {
    const { red, green } = areaTargetCounts(ids, stats);
    const max = Math.max(1, ...props.rows.map((r) => r.targets.length));
    return (
      <button
        key={key}
        type="button"
        className="ct-bf"
        data-lit={props.pointed === key || focus.area === key ? "" : undefined}
        onClick={onClick}
        onPointerEnter={() => props.setPointed(key)}
        onPointerLeave={() => props.setPointed(null)}
        title={title}
      >
        <span className="ct-bf-name">{label}</span>
        <span className="ct-bf-red-n">{red > 0 ? red : ""}</span>
        <span className="ct-bf-red">
          <i style={{ width: `${(red / max) * 100}%` }} />
        </span>
        <span className="ct-bf-green">
          <i style={{ width: `${(green / max) * 100}%` }} />
        </span>
        <span className="ct-bf-green-n">{t("areas.of", { green, total: ids.length })}</span>
      </button>
    );
  };

  let body: ReactNode;
  if (!sel) {
    body = (
      <>
        <p className="ct-tag">{t("places.tagMatch")}</p>
        <p className="ct-sub">{t("areas.tableLead")}</p>
        <div className="ct-bf-head" aria-hidden="true">
          <span />
          <span>{t("areas.tableRed")}</span>
          <span>{t("areas.tableGreen")}</span>
        </div>
        <div className="ct-bf-list">
          {rows.map((r) =>
            bf(
              r.targets.map((x) => x.id),
              r.id,
              props.areaName(r.id),
              () => onFocus({ area: r.id }),
            ),
          )}
        </div>
      </>
    );
  } else {
    const money = props.areaMoney.get(sel.id);
    const syn = areaSynergy(
      file.contracts,
      (c) => contractArea(c, props.lensKey, props.fctx),
      sel.id,
      props.docOf,
      (c) => contractInFocus(c, focus, props.fctx, { place: true }),
      MANY_DOCS,
    );
    const ids = sel.targets.map((x) => x.id);
    const withContracts = ids
      .filter((x) => statOf(stats, x).match.size > 0)
      .sort((a, b) => statOf(stats, b).mis.size - statOf(stats, a).mis.size || statOf(stats, b).match.size - statOf(stats, a).match.size);
    const without = ids.filter((x) => statOf(stats, x).match.size === 0);
    const max = Math.max(1, ...withContracts.map((x) => Math.max(statOf(stats, x).mis.size, statOf(stats, x).match.size)));
    const listIds = money?.ids ?? [];
    body = (
      <div className="ct-pick">
        <button type="button" className="ct-back" onClick={() => onFocus({ area: null })}>
          ‹ {t("areas.back")}
        </button>
        <h3 className="ct-pick-name" data-lit="">
          {props.areaName(sel.id)}
        </h3>
        <p className="ct-pick-facts">
          {t("areas.facts", { value: m.amount(sel.value), count: money?.ids.length ?? 0, targets: ids.length })}
          {syn.n >= SYNERGY_MIN ? ` · ${t("areas.synergy", { share: m.pct(syn.share), base: m.pct(syn.base) })}` : ""}
        </p>
        {withContracts.length > 0 && (
          <>
            <div className="ct-bf-head" aria-hidden="true">
              <span>{t("areas.rowsHead", { count: ids.length })}</span>
              <span>{t("areas.rowsRed")}</span>
              <span>{t("areas.rowsGreen")}</span>
            </div>
            <div className="ct-bf-list">
              {withContracts.slice(0, LIST_MAX).map((x) => {
                const s = statOf(stats, x);
                const tg = props.targetsById.get(x);
                return (
                  <button key={x} type="button" className="ct-bf" onClick={() => props.onTarget(x)} title={tg ? targetLine(tg, 200) : x}>
                    <span className="ct-bf-name">
                      <abbr title={setup.documents.find((d) => d.id === tg?.doc)?.name}>{props.docCode(tg?.doc ?? "")}</abbr> · {tg ? targetLine(tg, 60) : x}
                    </span>
                    <span className="ct-bf-red-n">{s.mis.size > 0 ? s.mis.size : ""}</span>
                    <span className="ct-bf-red">
                      <i style={{ width: `${(s.mis.size / max) * 100}%` }} />
                    </span>
                    <span className="ct-bf-green">
                      <i style={{ width: `${(s.match.size / max) * 100}%` }} />
                    </span>
                    <span className="ct-bf-green-n">{props.m.n(s.match.size)}</span>
                  </button>
                );
              })}
            </div>
            {withContracts.length > LIST_MAX && <p className="ct-more">{t("areas.more", { count: withContracts.length - LIST_MAX })}</p>}
          </>
        )}
        {without.length > 0 && (
          <details className="ct-details">
            <summary>{t("areas.without", { count: without.length })}</summary>
            <ul>
              {without.map((x) => {
                const tg = props.targetsById.get(x);
                return (
                  <li key={x}>
                    <button type="button" className="ct-plain-link" onClick={() => props.onTarget(x)}>
                      {props.docCode(tg?.doc ?? "")} · {tg ? targetLine(tg, 80) : x}
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
        {listIds.length > 0 && (
          <button type="button" className="ct-link" onClick={() => onList({ title: t("areas.listTitle", { area: props.areaName(sel.id) }), ids: listIds })}>
            {t("areas.seeContracts", { count: listIds.length })}
            <span aria-hidden="true"> ›</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <p className="brief-hub-kicker">{t("kicker.areas")}</p>
      {props.focusNote && <p className="ct-focus-note">{props.focusNote}</p>}
      <div className="ct-lens" role="group" aria-label={t("areas.lens")}>
        {setup.lenses.map((l) => (
          <button key={l.id} type="button" className="ct-lens-option" aria-pressed={l.id === focus.lens} onClick={() => onFocus({ lens: l.id as LensKey, area: null })}>
            {tl(l.id)}
          </button>
        ))}
      </div>
      <h2 className="brief-hub-headline" tabIndex={-1}>
        {headline}
      </h2>
      {gap && top && top.r.id !== gap.r.id && <p className="brief-hub-second">{t("areas.second", { area: props.areaName(top.r.id), mshare: m.pct(top.ms), tshare: m.pct(top.ts) })}</p>}
      {body}
    </>
  );
}

/** The lens as plain choices; a new lens lets the policy area in focus go. */
function LensChoices({
  setup,
  focus,
  onFocus,
  label,
  small = false,
}: {
  setup: ContractsSetup;
  focus: Focus;
  onFocus: (patch: Partial<Focus>) => void;
  label: string;
  small?: boolean;
}) {
  const tl = useTranslations("briefing.lens");
  return (
    <div className={`ct-lens${small ? " ct-lens-small" : ""}`} role="group" aria-label={label}>
      {setup.lenses.map((l) => (
        <button key={l.id} type="button" className="ct-lens-option" aria-pressed={l.id === focus.lens} onClick={() => l.id !== focus.lens && onFocus({ lens: l.id as LensKey, area: null })}>
          {tl(l.id)}
        </button>
      ))}
    </div>
  );
}

/** What the money mainly for nature or climate is for, by policy area: a
 *  plain ranked list, each area a way to the focus. */
function AreaMoneyList({
  rows,
  label,
  areaName,
  amount,
  focusArea,
  pointed,
  onPoint,
  onPick,
}: {
  rows: AreaRowB[];
  label: string;
  areaName: (id: string) => string;
  amount: (v: number) => string;
  focusArea: string | null;
  pointed: string | null;
  onPoint: (id: string | null) => void;
  onPick: (id: string) => void;
}) {
  const shown = rows.filter((r) => r.value > 0);
  const max = Math.max(1, ...shown.map((r) => r.value));
  return (
    <ul className="ct-rank" aria-label={label}>
      {shown.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            className="ct-rank-row"
            data-lit={pointed === r.id || focusArea === r.id ? "" : undefined}
            onClick={() => onPick(r.id)}
            onPointerEnter={() => onPoint(r.id)}
            onPointerLeave={() => onPoint(null)}
          >
            <span className="ct-rank-name">{areaName(r.id)}</span>
            <span className="ct-rank-bar ct-bar-money">
              <i style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
            <span className="ct-rank-num">{amount(r.value)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Targets behind a place, each a way to the target. */
function TargetRows({
  heading,
  rows,
  more,
  targetsById,
  docCode,
  onTarget,
}: {
  heading: string;
  rows: { id: string; count: string }[];
  more: string | null;
  targetsById: Map<string, { id: string; doc: string; label: string; text: string }>;
  docCode: (id: string) => string;
  onTarget: (id: string) => void;
}) {
  return (
    <>
      <p className="ct-sub">{heading}</p>
      <ul className="ct-target-rows">
        {rows.map((r) => {
          const x = targetsById.get(r.id);
          return (
            <li key={r.id}>
              <button type="button" className="ct-target-row" title={x ? targetLine(x, 240) : r.id} onClick={() => onTarget(r.id)}>
                <span className="ct-target-row-name">
                  {x ? `${docCode(x.doc)} · ${targetLine(x, 70)}` : r.id}
                </span>
                <span className="ct-target-row-count">{r.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {more && <p className="ct-more">{more}</p>}
    </>
  );
}

