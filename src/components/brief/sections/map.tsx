"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { docToneShares, partnersOf, type MapCell } from "@/lib/brief/compute";
import type { BriefData } from "@/lib/brief/data";
import { CommitmentMap, type MapMode } from "../commitment-map";
import { INK, commitmentLine, useNumbers } from "../ink";
import { SectionFrame } from "./frame";

/** Documents need this many commitments before the headline names them. */
const MIN_DOC_COMMITMENTS = 5;
const CALLOUTS = 5;

function byId(x: MapCell, y: MapCell): number {
  return x.commitment.id < y.commitment.id ? -1 : x.commitment.id > y.commitment.id ? 1 : 0;
}

/** The five commitments the chosen shading singles out, most first. */
function calloutsFor(cells: MapCell[], mode: MapMode): MapCell[] {
  const share = (c: MapCell) => (c.total > 0 ? c.reinforce / c.total : 0);
  return [...cells]
    .filter((c) => (mode === "apart" ? c.apart > 0 : c.reinforce > 0))
    .sort((x, y) =>
      mode === "apart"
        ? y.apart - x.apart || byId(x, y)
        : share(y) - share(x) || y.reinforce - x.reinforce || byId(x, y),
    )
    .slice(0, CALLOUTS);
}

export function MapSection({
  data,
  onOpenCommitment,
}: {
  data: BriefData;
  onOpenCommitment?: (id: string) => void;
}) {
  const t = useTranslations("brief.map");
  const { pct } = useNumbers();
  const [mode, setMode] = useState<MapMode>("apart");
  const [selected, setSelected] = useState<string | null>(null);

  const shares = useMemo(() => docToneShares(data.scope), [data.scope]);
  const partners = useMemo(
    () => (selected ? partnersOf(data.scope, selected) : null),
    [data.scope, selected],
  );
  const callouts = useMemo(() => calloutsFor(data.cells, mode), [data.cells, mode]);
  const docName = (id: string) => data.scope.docs.find((d) => d.id === id)?.name ?? id;

  const total = data.counts.total;
  const tone = mode === "apart" ? "apart" : "reinforce";
  const average = total > 0 ? data.counts[tone] / total : 0;
  const lead = shares
    .filter((s) => s.commitments >= MIN_DOC_COMMITMENTS && s.total > 0)
    .reduce<(typeof shares)[number] | null>(
      (best, s) => (!best || s[tone] / s.total > best[tone] / best.total ? s : best),
      null,
    );
  const headline =
    mode === "apart" && data.counts.apart === 0
      ? t("headlineEmpty")
      : lead
        ? t(mode === "apart" ? "headlineApart" : "headlineTogether", {
            doc: lead.doc.name,
            pct: pct(lead[tone] / lead.total),
            avg: pct(average),
          })
        : t("headlineEmpty");

  const steps =
    mode === "apart"
      ? (["0", "1", "2", "3", "4", "5"] as const).map((k, i) => ({
          label: t(`stepsApart.${k}`),
          fill: i === 0 ? INK.paper : INK.red[i - 1],
        }))
      : (["0", "1", "2", "3"] as const).map((k, i) => ({
          label: t(`stepsTogether.${k}`),
          fill: INK.green[i],
        }));

  const selectedCell = selected ? data.cells.find((c) => c.commitment.id === selected) : null;

  return (
    <SectionFrame id="map" headline={headline} sub={t("standfirst")}>
      <div className="brief-map-toolbar" data-screen-only role="radiogroup" aria-label={t("shading")}>
        <span className="brief-map-toolbar-label">{t("shading")}</span>
        {(["apart", "together"] as const).map((m) => (
          <label key={m} className={mode === m ? "brief-toggle brief-toggle-on" : "brief-toggle"}>
            <input
              type="radio"
              name="brief-map-mode"
              checked={mode === m}
              onChange={() => setMode(m)}
            />
            {t(m === "apart" ? "modeApart" : "modeTogether")}
          </label>
        ))}
      </div>

      <CommitmentMap
        cells={data.cells}
        docs={data.scope.docs}
        mode={mode}
        callouts={callouts.map((c) => c.commitment.id)}
        selected={selected}
        partners={partners}
        onSelect={setSelected}
      />

      <div className="brief-map-legend">
        <p className="brief-map-legend-title">
          {t(mode === "apart" ? "legendApart" : "legendTogether")}
        </p>
        <ol className="brief-map-legend-steps">
          {steps.map((s) => (
            <li key={s.label}>
              <span
                className="brief-map-swatch"
                style={{
                  background: s.fill,
                  borderColor: s.fill === INK.paper ? "#cfd3d8" : s.fill,
                }}
                aria-hidden="true"
              />
              <span>{s.label}</span>
            </li>
          ))}
        </ol>
      </div>

      {selectedCell ? (
        <div className="brief-map-selected">
          <p className="brief-map-selected-source">
            <span>{docName(selectedCell.commitment.doc)}</span>
            <span className="brief-map-selected-label">{selectedCell.commitment.label}</span>
          </p>
          <p className="brief-map-selected-text">{selectedCell.commitment.text}</p>
          <p className="brief-map-selected-counts">
            {t("selected", { apart: selectedCell.apart, reinforce: selectedCell.reinforce })}
          </p>
          <p className="brief-map-selected-actions" data-screen-only>
            <button
              type="button"
              className="brief-button-quiet"
              onClick={() => onOpenCommitment?.(selectedCell.commitment.id)}
            >
              {t("open")}
            </button>
            <button type="button" className="brief-button-quiet" onClick={() => setSelected(null)}>
              {t("clear")}
            </button>
          </p>
        </div>
      ) : (
        callouts.length > 0 && (
          <div className="brief-map-key">
            <p className="brief-map-key-title">{t(mode === "apart" ? "keyApart" : "keyTogether")}</p>
            <ol>
              {callouts.map((c, i) => (
                <li key={c.commitment.id} data-testid="brief-map-key-row">
                  <span className="brief-map-key-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>
                    {mode === "apart"
                      ? t("keyRowApart", {
                          label: commitmentLine(c.commitment, 70),
                          doc: docName(c.commitment.doc),
                          count: c.apart,
                        })
                      : t("keyRowTogether", {
                          label: commitmentLine(c.commitment, 70),
                          doc: docName(c.commitment.doc),
                          pct: pct(c.total > 0 ? c.reinforce / c.total : 0),
                        })}
                  </span>
                </li>
              ))}
            </ol>
            <p className="brief-map-hint" data-screen-only>
              {t("hint")}
            </p>
          </div>
        )
      )}
    </SectionFrame>
  );
}
