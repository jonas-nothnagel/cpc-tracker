"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { InfoBox } from "@/components/ui/info-box";
import { Modal } from "@/components/ui/modal";
import { ALIGNMENT_COLORS, getDocColor, getDocLabel } from "@/lib/utils";
import type {
  Target,
  AlignmentResult,
  BerData,
  AlignmentLevel,
  CountryConfig,
} from "@/types";
import {
  useClusterNetworkData,
  type NetworkNode,
} from "./use-cluster-network-data";
import { useForceSimulation } from "./use-force-simulation";
import { NetworkCanvas } from "./network-canvas";
import { ClusterLegend } from "./cluster-legend";

interface FundingNetworkProps {
  berData: BerData;
  budgetAlignment: AlignmentResult[];
  budgetPseudoTargets: Target[];
  /** Policy targets only — caller filters out BER/BTR pseudo-targets. */
  targets: Target[];
  /** Policy-policy alignment (data.alignment, not data.budgetAlignment). */
  targetAlignment: AlignmentResult[];
  countryConfig: CountryConfig | null;
}

const RESERVED_DOC_IDS = new Set(["BTR", "OTHER"]);

function AlignmentBadge({ level }: { level: AlignmentLevel }) {
  const t = useTranslations("viz.fundingNetwork");
  const labels: Record<AlignmentLevel, string> = {
    high: t("strengthScale.high"),
    medium: t("strengthScale.medium"),
    low: t("strengthScale.low"),
    none: t("strengthScale.none"),
    flagged: t("strengthScale.flagged"),
  };
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold leading-none"
      style={{
        backgroundColor: ALIGNMENT_COLORS[level] + "30",
        color: ALIGNMENT_COLORS[level],
      }}
    >
      {labels[level]}
    </span>
  );
}

export function FundingNetwork({
  berData,
  budgetAlignment,
  budgetPseudoTargets,
  targets,
  targetAlignment,
  countryConfig,
}: FundingNetworkProps) {
  const t = useTranslations("viz.fundingNetwork");
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setDimensions({ width: w, height: Math.min(w * 0.8, 700) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { nodes, links, adjacency, clusterTargets, clusterMeta } = useClusterNetworkData({
    targets,
    budgetAlignment,
    budgetPseudoTargets,
    berData,
    targetAlignment,
  });

  const { tick } = useForceSimulation({
    nodes,
    links,
    clusterTargets,
    width: dimensions.width,
    height: dimensions.height,
  });

  const handleNodeClick = useCallback((node: NetworkNode) => {
    setSelectedNode(node);
  }, []);

  const unfundedCount = clusterMeta.find((c) => c.type === "unfunded")?.targetCount ?? 0;
  const unitLabel = `${berData.unit} ${berData.currency}`.trim();
  const docTypes = (countryConfig?.documentTypes ?? []).filter(
    (d) => !RESERVED_DOC_IDS.has(d.id),
  );
  const selectedDocColor = selectedNode
    ? getDocColor(countryConfig, selectedNode.target.sourceDocument)
    : "#94a3b8";
  const selectedDocLabel = selectedNode
    ? getDocLabel(countryConfig, selectedNode.target.sourceDocument)
    : "";

  return (
    <div className="mt-8">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--undp-black)]">
            {t("title")}
            <InfoBox>{t("info")}</InfoBox>
          </h3>
          <p className="text-xs text-[var(--undp-gray)] mt-1">
            {t("summary", {
              targets: nodes.length,
              clusters: clusterMeta.length,
            })}
            {unfundedCount > 0 && (
              <span className="text-amber-700 font-medium">
                {" "}· {t("unfundedSuffix", { count: unfundedCount })}
              </span>
            )}
          </p>
        </div>
        {/* Document-type legend, derived from country config */}
        {docTypes.length > 0 && (
          <div className="flex flex-wrap gap-2 text-[9px]">
            {docTypes.map((d) => (
              <span key={d.id} className="flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: d.color }}
                />
                {d.shortLabel}
              </span>
            ))}
          </div>
        )}
      </div>

      <ClusterLegend
        clusters={clusterMeta}
        highlightedCluster={null}
        unitLabel={unitLabel}
      />

      <div
        ref={containerRef}
        className="w-full bg-[#fafbfc] rounded-xl border border-gray-100 overflow-hidden"
      >
        {dimensions.width > 0 && (
          <NetworkCanvas
            nodes={nodes}
            adjacency={adjacency}
            clusterTargets={clusterTargets}
            clusterMeta={clusterMeta}
            countryConfig={countryConfig}
            width={dimensions.width}
            height={dimensions.height}
            tick={tick}
            onNodeClick={handleNodeClick}
          />
        )}
      </div>

      <Modal
        open={selectedNode !== null}
        onClose={() => setSelectedNode(null)}
        title={selectedNode?.target.sourceLabel ?? t("targetDetail")}
      >
        {selectedNode && (
          <div className="p-5 max-w-lg">
            <div className="flex items-center gap-2 mb-3">
              <span
                className="inline-block px-2 py-0.5 rounded text-[10px] font-bold text-white"
                style={{ backgroundColor: selectedDocColor }}
              >
                {selectedDocLabel}
              </span>
              <span className="text-sm font-semibold text-[var(--undp-black)]">
                {selectedNode.target.sourceLabel}
              </span>
            </div>
            <p className="text-xs text-[var(--undp-black)] leading-relaxed mb-4">
              {selectedNode.target.text}
            </p>

            {selectedNode.programScores.length > 0 ? (
              <>
                <h4 className="text-xs font-semibold text-[var(--undp-black)] mb-2">
                  {t("alignedProgrammes", {
                    count: selectedNode.programScores.length,
                  })}
                </h4>
                <ul className="space-y-2">
                  {selectedNode.programScores.map((ps) => {
                    const prog = berData.programs.find((p) => p.code === ps.code);
                    return (
                      <li
                        key={ps.code}
                        className="flex items-start gap-2 text-xs border-l-2 pl-2 py-1"
                        style={{ borderColor: selectedNode.color }}
                      >
                        <div className="flex-1">
                          <span className="font-medium text-[var(--undp-black)]">
                            {prog?.name ?? ps.code}
                          </span>
                          <span className="text-[var(--undp-gray)] ml-1">
                            ({ps.code})
                          </span>
                        </div>
                        <AlignmentBadge level={ps.bestLevel} />
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <p className="text-xs text-amber-800 font-medium">
                  {t("noAlignmentDetected")}
                </p>
                <p className="text-[10px] text-amber-700 mt-0.5">
                  {t("noAlignmentHint")}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
