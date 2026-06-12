"use client";

/**
 * InstitutionFlow — an alternative right-column visual for the Implementation
 * slide: a Sankey-style flow from each named institution to the policy
 * documents its reported actions strongly align with. Ribbon thickness is the
 * number of that document's targets the institution reaches; clicking a ribbon
 * lists those targets, each opening the shared PairDrawer with the AI rationale.
 *
 * NEUTRALITY (hard rule): involvement as named in the country's own report,
 * never a strain or blame ranking (political-sensitivity guardrail). Ordering
 * top-to-bottom by reach is a layout choice, not a verdict; the caveat states
 * the counting honestly (a target named by several institutions counts under
 * each). HIGH-only, mirroring the coverage dot-map — AI-estimated, indicative.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import type {
  InstitutionFlowModel,
  InstitutionFlowTarget,
} from "@/lib/implementation-coherence";
import { getDocColor, getDocMediumLabel, getDocTypeOrder } from "@/lib/utils";
import type { CountryConfig } from "@/types";

// Layout constants (SVG user units; the svg scales to the column width).
const VIEW_W = 460;
const LEFT_LABEL = 120;
const RIGHT_LABEL = 92;
const NODE_W = 9;
const PAD_TOP = 6;
const NODE_GAP = 7;
const TALLEST = 340; // target height of the busier column
const LEFT_X1 = LEFT_LABEL + NODE_W; // ribbons leave here
const RIGHT_X0 = VIEW_W - RIGHT_LABEL - NODE_W; // ribbons arrive here

const INSTITUTION_NODE = "#9ca3af"; // neutral gray; documents carry their colour

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

interface PlacedNode {
  y0: number;
  y1: number;
}
interface PlacedLink {
  institutionKey: string;
  doc: string;
  value: number;
  sy: number; // source centre y (institution side)
  ty: number; // target centre y (document side)
  width: number;
  color: string;
  targets: InstitutionFlowTarget[];
}

export function InstitutionFlow({
  model,
  countryConfig,
  countryName,
  onOpenActionPair,
}: {
  model: InstitutionFlowModel;
  countryConfig: CountryConfig | null;
  countryName: string;
  onOpenActionPair: (actionId: string, targetId: string) => void;
}) {
  const t = useTranslations("briefing.implementationCenter");
  const [selected, setSelected] = useState<{ key: string; doc: string } | null>(
    null,
  );
  const [hovered, setHovered] = useState<string | null>(null);

  // Documents read in the briefing's configured order (matches the dot-map and
  // wheel legend); institutions stay in the model's reach order.
  const documents = useMemo(
    () =>
      [...model.documents].sort(
        (a, b) =>
          getDocTypeOrder(countryConfig, a.doc) -
          getDocTypeOrder(countryConfig, b.doc),
      ),
    [model.documents, countryConfig],
  );

  const layout = useMemo(() => {
    const institutions = model.institutions;
    const total = model.links.reduce((s, l) => s + l.value, 0);
    if (total === 0 || institutions.length === 0 || documents.length === 0) {
      return null;
    }
    const instGaps = (institutions.length - 1) * NODE_GAP;
    const docGaps = (documents.length - 1) * NODE_GAP;
    const maxGaps = Math.max(instGaps, docGaps);
    const scale = Math.min(16, Math.max(3, (TALLEST - maxGaps) / total));
    const contentH = total * scale + maxGaps;
    const svgH = contentH + PAD_TOP * 2;

    const place = (
      items: { value: number }[],
    ): PlacedNode[] => {
      const colH = total * scale + (items.length - 1) * NODE_GAP;
      let y = PAD_TOP + (contentH - colH) / 2;
      return items.map((it) => {
        const h = it.value * scale;
        const node = { y0: y, y1: y + h };
        y += h + NODE_GAP;
        return node;
      });
    };
    const instNodes = place(institutions);
    const docNodes = place(documents);
    const instIndex = new Map(institutions.map((n, i) => [n.key, i]));
    const docIndex = new Map(documents.map((d, i) => [d.doc, i]));

    // Stack each end's ribbons within its node, ordered by the OTHER end's
    // position so the bands cross as little as possible.
    type FlowLink = (typeof model.links)[number];
    const linksByInst = new Map<string, FlowLink[]>();
    const linksByDoc = new Map<string, FlowLink[]>();
    for (const l of model.links) {
      let li = linksByInst.get(l.institutionKey);
      if (!li) {
        li = [];
        linksByInst.set(l.institutionKey, li);
      }
      li.push(l);
      let ld = linksByDoc.get(l.doc);
      if (!ld) {
        ld = [];
        linksByDoc.set(l.doc, ld);
      }
      ld.push(l);
    }
    const sy = new Map<string, number>(); // linkId -> source y
    const ty = new Map<string, number>(); // linkId -> target y
    const id = (l: { institutionKey: string; doc: string }) =>
      `${l.institutionKey}${l.doc}`;
    institutions.forEach((inst, i) => {
      const node = instNodes[i];
      let off = node.y0;
      const ls = (linksByInst.get(inst.key) ?? []).sort(
        (a, b) => (docIndex.get(a.doc) ?? 0) - (docIndex.get(b.doc) ?? 0),
      );
      for (const l of ls) {
        sy.set(id(l), off + (l.value * scale) / 2);
        off += l.value * scale;
      }
    });
    documents.forEach((d, i) => {
      const node = docNodes[i];
      let off = node.y0;
      const ls = (linksByDoc.get(d.doc) ?? []).sort(
        (a, b) =>
          (instIndex.get(a.institutionKey) ?? 0) -
          (instIndex.get(b.institutionKey) ?? 0),
      );
      for (const l of ls) {
        ty.set(id(l), off + (l.value * scale) / 2);
        off += l.value * scale;
      }
    });

    const placedLinks: PlacedLink[] = model.links.map((l) => ({
      institutionKey: l.institutionKey,
      doc: l.doc,
      value: l.value,
      sy: sy.get(id(l)) ?? 0,
      ty: ty.get(id(l)) ?? 0,
      width: Math.max(1.5, l.value * scale),
      color: getDocColor(countryConfig, l.doc),
      targets: l.targets,
    }));

    return { svgH, scale, institutions, instNodes, docNodes, placedLinks };
  }, [model, documents, countryConfig]);

  const selectedLink =
    selected &&
    model.links.find(
      (l) => l.institutionKey === selected.key && l.doc === selected.doc,
    );
  const selectedInstLabel = selected
    ? model.institutions.find((i) => i.key === selected.key)?.label ?? ""
    : "";

  const labelFor = (node: { label: string; isOther?: boolean }) =>
    node.isOther
      ? t("flow.other", { count: model.bundledInstitutions })
      : node.label;

  return (
    <div className="px-1 space-y-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)]">
          {t("header.eyebrow")}
        </p>
        <p className="text-[15px] font-semibold text-[var(--undp-black)] leading-tight mt-0.5">
          {t("flow.title")}
        </p>
        <p className="text-[11.5px] text-[var(--undp-gray)] mt-0.5">
          {t("header.subtitle", { country: countryName })}
        </p>
        <p className="text-[11.5px] text-[var(--undp-gray)] mt-1.5 max-w-prose">
          {t("flow.intro")}
        </p>
      </div>

      {!layout ? (
        <p className="text-[12px] italic text-[var(--undp-gray)] py-6">
          {t("flow.empty")}
        </p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${VIEW_W} ${layout.svgH}`}
            width="100%"
            role="img"
            aria-label={t("flow.title")}
            className="overflow-visible"
          >
            {/* Ribbons first, so the thin node bars and labels sit on top. */}
            {layout.placedLinks.map((l) => {
              const xm = (LEFT_X1 + RIGHT_X0) / 2;
              const active =
                hovered === null
                  ? true
                  : hovered === l.institutionKey || hovered === l.doc;
              const isSel =
                selected?.key === l.institutionKey && selected?.doc === l.doc;
              return (
                <path
                  key={`${l.institutionKey}-${l.doc}`}
                  d={`M${LEFT_X1},${l.sy} C${xm},${l.sy} ${xm},${l.ty} ${RIGHT_X0},${l.ty}`}
                  fill="none"
                  stroke={l.color}
                  strokeWidth={l.width}
                  strokeOpacity={isSel ? 0.85 : active ? 0.45 : 0.12}
                  className="cursor-pointer transition-[stroke-opacity]"
                  onMouseEnter={() => setHovered(l.institutionKey)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() =>
                    setSelected(
                      isSel ? null : { key: l.institutionKey, doc: l.doc },
                    )
                  }
                >
                  <title>{`${
                    model.institutions.find((i) => i.key === l.institutionKey)
                      ?.isOther
                      ? t("flow.other", { count: model.bundledInstitutions })
                      : model.institutions.find(
                          (i) => i.key === l.institutionKey,
                        )?.label
                  } → ${getDocMediumLabel(countryConfig, l.doc)}: ${t("flow.detailCount", { count: l.value })}`}</title>
                </path>
              );
            })}

            {/* Institution nodes + right-aligned labels. */}
            {layout.institutions.map((inst, i) => {
              const node = layout.instNodes[i];
              return (
                <g
                  key={inst.key}
                  onMouseEnter={() => setHovered(inst.key)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <rect
                    x={LEFT_LABEL}
                    y={node.y0}
                    width={NODE_W}
                    height={Math.max(1, node.y1 - node.y0)}
                    fill={INSTITUTION_NODE}
                    rx={1.5}
                  />
                  <text
                    x={LEFT_LABEL - 5}
                    y={(node.y0 + node.y1) / 2}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-[var(--undp-black)]"
                    style={{ fontSize: 9 }}
                  >
                    {truncate(labelFor(inst), 22)}
                    <title>{labelFor(inst)}</title>
                  </text>
                </g>
              );
            })}

            {/* Document nodes (their colour) + left-aligned labels. */}
            {documents.map((d, i) => {
              const node = layout.docNodes[i];
              const color = getDocColor(countryConfig, d.doc);
              return (
                <g
                  key={d.doc}
                  onMouseEnter={() => setHovered(d.doc)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <rect
                    x={RIGHT_X0}
                    y={node.y0}
                    width={NODE_W}
                    height={Math.max(1, node.y1 - node.y0)}
                    fill={color}
                    rx={1.5}
                  />
                  <text
                    x={RIGHT_X0 + NODE_W + 5}
                    y={(node.y0 + node.y1) / 2}
                    textAnchor="start"
                    dominantBaseline="middle"
                    className="fill-[var(--undp-black)]"
                    style={{ fontSize: 9.5 }}
                  >
                    {truncate(getDocMediumLabel(countryConfig, d.doc), 14)}
                    <title>{getDocMediumLabel(countryConfig, d.doc)}</title>
                  </text>
                </g>
              );
            })}
          </svg>

          {model.coordinationTargets > 0 && (
            <p className="text-[11px] text-[var(--undp-black)] leading-relaxed max-w-prose">
              {t("flow.coordination", { count: model.coordinationTargets })}
            </p>
          )}

          {/* Drill-down: the targets behind the selected ribbon, each opening
              the shared drawer with the AI rationale. */}
          {selectedLink ? (
            <div className="border-t border-gray-200 pt-2.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--undp-gray)] mb-1.5">
                {truncate(selectedInstLabel, 28)} ·{" "}
                {getDocMediumLabel(countryConfig, selectedLink.doc)}{" "}
                <span className="text-[var(--undp-gray)]/60">
                  · {t("flow.detailCount", { count: selectedLink.value })}
                </span>
              </p>
              <ul className="space-y-0.5 max-h-44 overflow-y-auto pr-1">
                {selectedLink.targets.map((tg) => (
                  <li key={tg.targetId}>
                    <button
                      type="button"
                      onClick={() => onOpenActionPair(tg.actionId, tg.targetId)}
                      className="w-full text-left flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-black/[0.04] cursor-pointer"
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: getDocColor(
                            countryConfig,
                            selectedLink.doc,
                          ),
                        }}
                      />
                      <span className="text-[12px] text-[var(--undp-black)] truncate">
                        {tg.targetLabel}
                      </span>
                      <span
                        aria-hidden="true"
                        className="ml-auto shrink-0 text-[var(--undp-gray)]/50 text-[12px]"
                      >
                        ›
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[11px] italic text-[var(--undp-gray)]">
              {t("flow.selectHint")}
            </p>
          )}

          <p className="text-[11px] italic text-[var(--undp-gray)] max-w-prose">
            {t("flow.caveat")}
          </p>
        </>
      )}
    </div>
  );
}
