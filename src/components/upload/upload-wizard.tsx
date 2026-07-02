"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Header } from "@/components/ui/header";
import { useRouter } from "@/i18n/navigation";
import type { PolicyDocumentType } from "@/types";
import type { TargetRow } from "@/lib/csv-parser";
import { smartParse } from "@/lib/csv-parser";
import {
  type BtrData,
  type UploadedDoc,
  MAX_TARGETS,
  COST_PER_CALL,
  isBtrExcel,
  detectBtrType,
  mergeBtrData,
} from "@/lib/upload-helpers";
import { useTargets } from "@/hooks/useTargets";
import { useExtraction } from "@/hooks/useExtraction";
import { useCategories } from "@/hooks/useCategories";
import { WizardNav } from "@/components/upload/wizard-nav";
import { StepCountryDocuments } from "@/components/upload/step-country-documents";
import { StepReferenceData } from "@/components/upload/step-reference-data";
import { StepReviewConfigure } from "@/components/upload/step-review-configure";
import { StepSummaryRun } from "@/components/upload/step-summary-run";

interface UploadWizardProps {
  /** When set, the country field is pre-filled and locked. */
  lockedCountry?: string;
  /** When set, scopes header nav links to this path (standalone mode). */
  basePath?: string;
}

export function UploadWizard({ lockedCountry, basePath }: UploadWizardProps) {
  const router = useRouter();
  const t = useTranslations("upload.wizard");

  // ─── Hooks ──────────────────────────────────────────────────────────────
  const {
    targets,
    setTargets,
    targetsByDocument,
    expandedGroups,
    toggleExpanded,
    editingManualTargets,
    extractionBackup,
    addTarget,
    removeTarget,
    addExtractedToTargets,
    restoreExtractionReview,
    startEditManualTargets,
    saveManualTargetsEdits,
    updateEditingManualTarget,
    removeFromEditingManual,
  } = useTargets();

  const extraction = useExtraction();
  const categories = useCategories();

  // ─── Wizard state ──────────────────────────────────────────────────────
  const [step, setStep] = useState(0);

  // ─── Local state ────────────────────────────────────────────────────────
  const [country, setCountry] = useState(lockedCountry ?? "");
  const [currentText, setCurrentText] = useState("");
  const [currentDoc, setCurrentDoc] = useState<PolicyDocumentType>("NDC");
  const [currentLabel, setCurrentLabel] = useState("");
  const [customDocName, setCustomDocName] = useState("");
  const [mode, setMode] = useState<"upload" | "manual">("upload");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [btrParsedData, setBtrParsedData] = useState<BtrData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [addedReferenceDocs, setAddedReferenceDocs] = useState<Set<PolicyDocumentType>>(new Set());
  const [includeBtr, setIncludeBtr] = useState(true);
  const [includeNr7, setIncludeNr7] = useState(true);
  // ─── Derived values ─────────────────────────────────────────────────────
  const canProceed = useMemo(() => {
    switch (step) {
      case 0: return true;
      case 1: return true;
      case 2: return targets.length > 0;
      case 3: return targets.length > 0;
      default: return false;
    }
  }, [step, targets.length]);

  const totalActiveCategories = useMemo(
    () => categories.groups.reduce((sum, g) => sum + g.items.filter((c) => c.enabled).length, 0),
    [categories.groups]
  );

  const estimate = useMemo(() => {
    const n = targets.length;
    const cats = totalActiveCategories;
    if (n === 0) return null;
    const quantCalls = n;
    const classCalls = n * cats;
    const decompCalls = n;
    const docTypes = new Set(targets.map((t) => t.sourceDocument)).size;
    const estPairs = docTypes > 1 ? Math.floor((n * n) / (docTypes * 2)) : 0;
    const totalCalls = quantCalls + classCalls + decompCalls + estPairs;
    const estCost = totalCalls * COST_PER_CALL;
    return { totalCalls, estCost, estPairs, docTypes };
  }, [targets, totalActiveCategories]);

  const documentTypeCount = useMemo(
    () => new Set(targets.map((t) => t.sourceDocument)).size,
    [targets]
  );

  // ─── Manual entry ───────────────────────────────────────────────────────
  function handleAddTarget() {
    if (!currentText.trim()) return;
    const needsCustomName = currentDoc === "SECTORAL" || currentDoc === "OTHER";
    const label =
      currentLabel.trim() ||
      (needsCustomName && customDocName.trim()
        ? `${customDocName.trim()} ${targets.filter((tg) => tg.sourceDocument === currentDoc).length + 1}`
        : t("autoLabel", { n: targets.length + 1 }));
    addTarget({
      text: currentText.trim(),
      sourceDocument: currentDoc,
      sourceLabel: label,
      source: "manual",
    });
    setCurrentText("");
    setCurrentLabel("");
  }

  // ─── File upload (CSV/TSV/Excel) ───────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    const isExcel = /\.xlsx?$/i.test(file.name);
    const docId = `doc_${Date.now()}`;

    if (isExcel && isBtrExcel(file.name)) {
      setUploadedDocs((prev) => [...prev, {
        id: docId, fileName: file.name, fileType: "btr", status: "parsing",
      }]);

      const form = new FormData();
      form.append("file", file);
      form.append("type", detectBtrType(file.name));
      fetch("/api/parse-btr", { method: "POST", body: form })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json();
            throw new Error(body.error || t("errors.parseBtr"));
          }
          return res.json();
        })
        .then((data) => {
          setBtrParsedData((prev) => mergeBtrData(prev, data as BtrData));
          setUploadedDocs((prev) => prev.map((d) =>
            d.id === docId ? {
              ...d,
              status: "ready" as const,
              btrSummary: {
                mitigationMeasures: data.mitigationMeasures?.length ?? 0,
                sectorEmissions: data.sectorEmissions?.bySector?.length ?? 0,
                projections: data.projections?.length ?? 0,
                technologySupport: data.technologySupport?.length ?? 0,
                capacityBuilding: data.capacityBuilding?.length ?? 0,
              },
            } : d
          ));
        })
        .catch((err) => {
          setUploadedDocs((prev) => prev.map((d) =>
            d.id === docId ? { ...d, status: "error" as const, error: err.message } : d
          ));
        });
    } else if (isExcel) {
      setUploadedDocs((prev) => [...prev, {
        id: docId, fileName: file.name, fileType: "targets", status: "parsing",
      }]);

      const form = new FormData();
      form.append("file", file);
      fetch("/api/parse-excel-targets", { method: "POST", body: form })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json();
            throw new Error(body.error || t("errors.parseExcel"));
          }
          return res.json();
        })
        .then((data: { targets: { text: string; sourceDocument: string; sourceLabel: string; activities?: string; actions?: string }[] }) => {
          if (data.targets && data.targets.length > 0) {
            const rowsWithSource = data.targets.map((r) => ({
              ...r,
              sourceDocument: r.sourceDocument as import("@/types").PolicyDocumentType,
              source: "file" as const,
            }));
            setTargets((prev) => [...prev, ...rowsWithSource].slice(0, MAX_TARGETS));
            const counts: Record<string, number> = {};
            for (const r of data.targets) counts[r.sourceDocument] = (counts[r.sourceDocument] || 0) + 1;
            setUploadedDocs((prev) => prev.map((d) =>
              d.id === docId ? { ...d, status: "ready" as const, targetCount: data.targets.length, docTypeCounts: counts } : d
            ));
          } else {
            setUploadedDocs((prev) => prev.map((d) =>
              d.id === docId ? { ...d, status: "error" as const, error: t("errors.noTargetsExcel") } : d
            ));
          }
        })
        .catch((err) => {
          setUploadedDocs((prev) => prev.map((d) =>
            d.id === docId ? { ...d, status: "error" as const, error: err.message } : d
          ));
        });
    } else {
      setUploadedDocs((prev) => [...prev, {
        id: docId, fileName: file.name, fileType: "targets", status: "parsing",
      }]);

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (!text) return;
        const result = smartParse(text);
        if (result && result.rows.length > 0) {
          const rowsWithSource = result.rows.map((r) => ({ ...r, source: "file" as const }));
          setTargets((prev) => [...prev, ...rowsWithSource].slice(0, MAX_TARGETS));
          const counts: Record<string, number> = {};
          for (const r of result.rows) counts[r.sourceDocument] = (counts[r.sourceDocument] || 0) + 1;
          setUploadedDocs((prev) => prev.map((d) =>
            d.id === docId ? { ...d, status: "ready" as const, targetCount: result.rows.length, docTypeCounts: counts } : d
          ));
        } else {
          setUploadedDocs((prev) => prev.map((d) =>
            d.id === docId ? { ...d, status: "error" as const, error: t("errors.noTargets") } : d
          ));
        }
      };
      reader.readAsText(file);
    }
  }, [t, setTargets]);

  // ─── Unified drop/input handlers ───────────────────────────────────────
  function handleUnifiedDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const docs = files.filter((f) => /\.(pdf|docx|txt)$/i.test(f.name));
    const others = files.filter((f) => /\.(csv|tsv|xlsx?)$/i.test(f.name));
    if (docs.length > 0) {
      extraction.queueFilesForExtraction(docs, extraction.extractDocType, extraction.extractDocType);
    }
    for (const file of others) handleFile(file);
  }

  function handleUnifiedFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const docs = files.filter((f) => /\.(pdf|docx|txt)$/i.test(f.name));
    const others = files.filter((f) => /\.(csv|tsv|xlsx?)$/i.test(f.name));
    if (docs.length > 0) {
      extraction.queueFilesForExtraction(docs, extraction.extractDocType, extraction.extractDocType);
    }
    for (const file of others) handleFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ─── Extraction accept/restore ─────────────────────────────────────────
  function handleAcceptExtraction() {
    addExtractedToTargets(
      extraction.extractedItems,
      extraction.extractFileName,
      extraction.extractDocLabel
    );
    extraction.discardExtraction();
    if (extraction.extractionQueue.length > 0) {
      extraction.processNextInQueue(extraction.extractDocType, extraction.extractDocType);
    }
  }

  function handleRestoreExtractionReview() {
    const backup = restoreExtractionReview();
    if (backup) {
      extraction.restoreFromBackup(backup);
    }
  }

  function removeDoc(docId: string) {
    const doc = uploadedDocs.find((d) => d.id === docId);
    if (doc?.fileType === "btr") setBtrParsedData(null);
    setUploadedDocs((prev) => prev.filter((d) => d.id !== docId));
  }

  // ─── Reference data ─────────────────────────────────────────────────────
  function handleAddReferenceTargets(rows: TargetRow[]) {
    setTargets((prev) => [...prev, ...rows].slice(0, MAX_TARGETS));
  }

  function handleRemoveReferenceTargets(docType: PolicyDocumentType) {
    setTargets((prev) => prev.filter((t) => t.sourceDocument !== docType));
  }

  function handleMarkReferenceAdded(docType: PolicyDocumentType) {
    setAddedReferenceDocs((prev) => new Set(prev).add(docType));
  }

  function handleMarkReferenceRemoved(docType: PolicyDocumentType) {
    setAddedReferenceDocs((prev) => {
      const next = new Set(prev);
      next.delete(docType);
      return next;
    });
  }

  // ─── Submit ─────────────────────────────────────────────────────────────
  async function runAnalysis() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: country || t("unknownCountry"),
          targets,
          nbsCategories: categories.activeNbs.map(({ id, name, description }) => ({
            id, name, description,
          })),
          sectors: categories.activeSectors.map(({ id, name, description }) => ({
            id, name, description,
          })),
          ...(btrParsedData && includeBtr ? { btrData: btrParsedData } : {}),
          ...(extraction.extractionFootprint.call_count > 0
            ? { initialFootprint: extraction.extractionFootprint }
            : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || t("errors.startAnalysis"));
      }
      const { analysisId } = await res.json();
      router.push(`/analysis/${analysisId}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : t("errors.unexpected"));
      setSubmitting(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header subtitle={t("headerSubtitle")} basePath={basePath} />

      <main className="flex-1 max-w-5xl mx-auto px-6 py-8 w-full">
        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[var(--undp-black)] mb-1">
            {t("title")}
          </h1>
          <p className="text-sm text-[var(--undp-gray)] leading-relaxed max-w-2xl">
            {t("subtitle")}
          </p>
        </div>

        {/* Wizard navigation */}
        <WizardNav
          currentStep={step}
          onStepChange={setStep}
          canProceed={canProceed}
          hasExtractionPending={
            step !== 0 && extraction.extractedItems.length > 0
          }
        />

        {/* Step content */}
        {step === 0 && (
          <StepCountryDocuments
            country={country}
            onCountryChange={setCountry}
            countryLocked={!!lockedCountry}
            mode={mode}
            onModeChange={setMode}
            extractDocType={extraction.extractDocType}
            onExtractDocTypeChange={extraction.setExtractDocType}
            extractDocLabel={extraction.extractDocLabel}
            onExtractDocLabelChange={extraction.setExtractDocLabel}
            extracting={extraction.extracting}
            extractFileName={extraction.extractFileName}
            onFileDrop={handleUnifiedDrop}
            onFileInput={handleUnifiedFileInput}
            fileInputRef={fileInputRef}
            dragging={dragging}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            extractionQueueLength={extraction.extractionQueue.length}
            extractError={extraction.extractError}
            extractEmptyFile={extraction.extractEmptyFile}
            extractedItems={extraction.extractedItems}
            onToggleItem={extraction.toggleItem}
            onKeepAll={extraction.keepAll}
            onRemoveAll={extraction.removeAll}
            onUpdateItem={extraction.updateItem}
            onAddManual={extraction.addManualExtractedItem}
            onAcceptExtraction={handleAcceptExtraction}
            onDiscardExtraction={extraction.discardExtraction}
            manualLabel={extraction.extractManualLabel}
            onManualLabelChange={extraction.setExtractManualLabel}
            manualText={extraction.extractManualText}
            onManualTextChange={extraction.setExtractManualText}
            uploadedDocs={uploadedDocs}
            onRemoveDoc={removeDoc}
            currentDoc={currentDoc}
            onDocChange={setCurrentDoc}
            currentText={currentText}
            onTextChange={setCurrentText}
            currentLabel={currentLabel}
            onLabelChange={setCurrentLabel}
            customDocName={customDocName}
            onCustomDocNameChange={setCustomDocName}
            onAddTarget={handleAddTarget}
            targetCount={targets.length}
          />
        )}

        {step === 1 && (
          <StepReferenceData
            country={country}
            btrParsedData={btrParsedData}
            uploadedDocs={uploadedDocs}
            targetCount={targets.length}
            documentTypeCount={documentTypeCount}
            onAddReferenceTargets={handleAddReferenceTargets}
            onRemoveReferenceTargets={handleRemoveReferenceTargets}
            addedReferenceDocs={addedReferenceDocs}
            onMarkReferenceAdded={handleMarkReferenceAdded}
            onMarkReferenceRemoved={handleMarkReferenceRemoved}
            includeBtr={includeBtr}
            onToggleBtr={() => setIncludeBtr((v) => !v)}
            includeNr7={includeNr7}
            onToggleNr7={() => setIncludeNr7((v) => !v)}
          />
        )}

        {step === 2 && (
          <StepReviewConfigure
            targets={targets}
            targetsByDocument={targetsByDocument}
            expandedGroups={expandedGroups}
            onToggleExpand={toggleExpanded}
            onRemoveTarget={removeTarget}
            extractionBackup={extractionBackup}
            onRestoreExtractionReview={handleRestoreExtractionReview}
            onStartEditManualTargets={startEditManualTargets}
            editingManualTargets={editingManualTargets}
            onUpdate={updateEditingManualTarget}
            onRemoveFromEditing={removeFromEditingManual}
            onSaveEdits={saveManualTargetsEdits}
            currentDoc={currentDoc}
            onDocChange={setCurrentDoc}
            currentText={currentText}
            onTextChange={setCurrentText}
            currentLabel={currentLabel}
            onLabelChange={setCurrentLabel}
            customDocName={customDocName}
            onCustomDocNameChange={setCustomDocName}
            onAddTarget={handleAddTarget}
            groups={categories.groups}
            showCategories={categories.showCategories}
            onToggleShowCategories={() => categories.setShowCategories(!categories.showCategories)}
            toggleCategory={categories.toggleCategory}
            removeCategory={categories.removeCategory}
            toggleAllInGroup={categories.toggleAllInGroup}
            addingTo={categories.addingTo}
            onSetAddingTo={categories.setAddingTo}
            newCatName={categories.newCatName}
            onNewCatNameChange={categories.setNewCatName}
            newCatDesc={categories.newCatDesc}
            onNewCatDescChange={categories.setNewCatDesc}
            onAddCustomCategory={categories.addCustomCategory}
            onAddGroup={categories.addGroup}
            onRemoveGroup={categories.removeGroup}
          />
        )}

        {step === 3 && (
          <StepSummaryRun
            country={country}
            targets={targets}
            targetsByDocument={targetsByDocument}
            groups={categories.groups}
            activeNbsCount={categories.activeNbs.length}
            activeSectorsCount={categories.activeSectors.length}
            estimate={estimate}
            hasBtrData={!!btrParsedData}
            submitting={submitting}
            submitError={submitError}
            onRunAnalysis={runAnalysis}
            extractionFootprint={extraction.extractionFootprint}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 mt-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 text-sm text-[var(--undp-gray)]">
          {t("footer")}
        </div>
      </footer>
    </div>
  );
}
