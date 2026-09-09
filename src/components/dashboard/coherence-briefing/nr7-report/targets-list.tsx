"use client";

/**
 * Nr7TargetsList — the NR7 by national target: the rating mix, then the
 * twenty targets as expandable rows (rating, questionnaire, target-specific
 * indicators, links). One row open at a time; the caller owns which.
 */

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useNr7BadgeLabels } from "@/lib/labels";
import { MixBar } from "./mix-bar";
import { NR7_COLORS, NR7_STATUS_ORDER } from "./nr7-colors";
import { Nr7TargetRow } from "./target-row";
import type { Nr7ReportModel } from "./nr7-self-report";
import type { Nr7PairRef } from "./pair-by-target";

export function Nr7TargetsList({
  model,
  expandedTargetId,
  onToggleTarget,
  onFocusIndicator,
  canOpenNbsap,
  onOpenNbsap,
  pairByTarget,
  onOpenPair,
}: {
  model: Nr7ReportModel;
  expandedTargetId: string | null;
  onToggleTarget: (targetId: string) => void;
  onFocusIndicator: (indicatorId: string) => void;
  canOpenNbsap: (nbsapTargetId: string) => boolean;
  onOpenNbsap: (nbsapTargetId: string) => void;
  pairByTarget: Map<string, Nr7PairRef>;
  onOpenPair: (actionId: string, nbsapId: string) => void;
}) {
  const t = useTranslations("briefing.nr7Report");
  const statusLabels = useNr7BadgeLabels();
  const indicatorsById = useMemo(() => new Map(model.indicators.map((i) => [i.id, i])), [model.indicators]);

  // Land on the target a signal or a chip pointed at.
  useEffect(() => {
    if (!expandedTargetId) return;
    document.getElementById(`nr7-row-${expandedTargetId}`)?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [expandedTargetId]);

  return (
    <div className="space-y-4">
      <MixBar
        ariaLabel={t("rating.legendAria", { count: model.totals.targets })}
        height="h-4"
        segments={NR7_STATUS_ORDER.map((s) => ({ key: s, label: statusLabels[s], count: model.totals.byStatus[s], color: NR7_COLORS[s] }))}
      />
      <ul>
        {model.targets.map((row) => {
          const pair = pairByTarget.get(row.targetId);
          return (
            <Nr7TargetRow
              key={row.targetId}
              row={row}
              expanded={expandedTargetId === row.targetId}
              onToggle={() => onToggleTarget(row.targetId)}
              indicatorsById={indicatorsById}
              onFocusIndicator={onFocusIndicator}
              onOpenNbsap={row.nbsapTargetId && canOpenNbsap(row.nbsapTargetId) ? () => onOpenNbsap(row.nbsapTargetId!) : undefined}
              onOpenPair={pair ? () => onOpenPair(pair.actionId, pair.nbsapId) : undefined}
            />
          );
        })}
      </ul>
    </div>
  );
}
