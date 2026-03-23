import { useState, useMemo, useCallback } from "react";
import type { PolicyDocumentType } from "@/types";
import type { TargetRow } from "@/lib/csv-parser";
import type { ExtractedItem } from "@/lib/upload-helpers";
import { MAX_TARGETS, TARGETS_PREVIEW } from "@/lib/upload-helpers";

export function useTargets() {
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<PolicyDocumentType>>(new Set());
  const [editingManualTargets, setEditingManualTargets] = useState<{
    docType: PolicyDocumentType;
    targets: TargetRow[];
  } | null>(null);
  const [extractionBackup, setExtractionBackup] = useState<{
    items: ExtractedItem[];
    fileName: string;
    docLabel: string;
    addedTargets: TargetRow[];
  } | null>(null);

  const targetsByDocument = useMemo(() => {
    const order: PolicyDocumentType[] = [];
    const map = new Map<PolicyDocumentType, { t: TargetRow; idx: number }[]>();
    targets.forEach((t, idx) => {
      if (!map.has(t.sourceDocument)) {
        order.push(t.sourceDocument);
        map.set(t.sourceDocument, []);
      }
      map.get(t.sourceDocument)!.push({ t, idx });
    });
    return order.map((docType) => ({ docType, targets: map.get(docType)! }));
  }, [targets]);

  const addTarget = useCallback(
    (row: TargetRow) => {
      if (targets.length >= MAX_TARGETS) return;
      setTargets((prev) => [...prev, row]);
    },
    [targets.length]
  );

  const removeTarget = useCallback((index: number) => {
    setTargets((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const bulkAddTargets = useCallback((rows: TargetRow[]) => {
    setTargets((prev) => [...prev, ...rows].slice(0, MAX_TARGETS));
  }, []);

  const toggleExpanded = useCallback((docType: PolicyDocumentType) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(docType)) next.delete(docType);
      else next.add(docType);
      return next;
    });
  }, []);

  const addExtractedToTargets = useCallback(
    (
      extractedItems: ExtractedItem[],
      extractFileName: string,
      extractDocLabel: string
    ) => {
      const accepted = extractedItems.filter((item) => item.accepted);
      const prefix = extractDocLabel.trim();
      const newTargets: TargetRow[] = accepted.map((item, i) => ({
        text: item.text,
        sourceDocument: item.sourceDocument as PolicyDocumentType,
        sourceLabel: prefix ? `${prefix} ${i + 1}` : item.label,
        source: "extraction",
      }));
      setExtractionBackup({
        items: [...extractedItems],
        fileName: extractFileName,
        docLabel: extractDocLabel,
        addedTargets: newTargets,
      });
      setTargets((prev) => [...prev, ...newTargets].slice(0, MAX_TARGETS));
      return newTargets;
    },
    []
  );

  const restoreExtractionReview = useCallback(() => {
    if (!extractionBackup) return null;
    setTargets((prev) =>
      prev.filter(
        (t) =>
          !extractionBackup.addedTargets.some(
            (a) => a.text === t.text && a.sourceLabel === t.sourceLabel
          )
      )
    );
    const backup = extractionBackup;
    setExtractionBackup(null);
    return backup;
  }, [extractionBackup]);

  const startEditManualTargets = useCallback(
    (docType: PolicyDocumentType) => {
      const manualTargets = targets.filter(
        (t) => t.sourceDocument === docType && t.source === "manual"
      );
      if (manualTargets.length === 0) return;
      setTargets((prev) =>
        prev.filter((t) => !(t.sourceDocument === docType && t.source === "manual"))
      );
      setEditingManualTargets({ docType, targets: manualTargets });
    },
    [targets]
  );

  const saveManualTargetsEdits = useCallback(() => {
    if (!editingManualTargets) return;
    setTargets((prev) => [...prev, ...editingManualTargets.targets].slice(0, MAX_TARGETS));
    setEditingManualTargets(null);
  }, [editingManualTargets]);

  const updateEditingManualTarget = useCallback(
    (idx: number, updates: Partial<TargetRow>) => {
      if (!editingManualTargets) return;
      setEditingManualTargets({
        ...editingManualTargets,
        targets: editingManualTargets.targets.map((t, i) =>
          i === idx ? { ...t, ...updates } : t
        ),
      });
    },
    [editingManualTargets]
  );

  const removeFromEditingManual = useCallback(
    (idx: number) => {
      if (!editingManualTargets) return;
      const newTargets = editingManualTargets.targets.filter((_, i) => i !== idx);
      setEditingManualTargets(
        newTargets.length > 0 ? { ...editingManualTargets, targets: newTargets } : null
      );
    },
    [editingManualTargets]
  );

  return {
    targets,
    setTargets,
    targetsByDocument,
    expandedGroups,
    toggleExpanded,
    editingManualTargets,
    extractionBackup,
    addTarget,
    removeTarget,
    bulkAddTargets,
    addExtractedToTargets,
    restoreExtractionReview,
    startEditManualTargets,
    saveManualTargetsEdits,
    updateEditingManualTarget,
    removeFromEditingManual,
    MAX_TARGETS,
    TARGETS_PREVIEW,
  };
}
