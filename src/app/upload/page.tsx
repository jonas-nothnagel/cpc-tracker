"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { PolicyDocumentType } from "@/types";
import { smartParse } from "@/lib/csv-parser";
import {
  type BtrData,
  type UploadedDoc,
  MAX_TARGETS,
  COST_PER_CALL,
  CROSS_CUTTING_THEMES_COUNT,
  detectBtrType,
  mergeBtrData,
} from "@/lib/upload-helpers";
import { useTargets } from "@/hooks/useTargets";
import { useExtraction } from "@/hooks/useExtraction";
import { useCategories } from "@/hooks/useCategories";
import { DocumentUploadZone } from "@/components/upload/document-upload-zone";
import { ExtractReviewPanel } from "@/components/upload/extract-review-panel";
import { ManualEntryForm } from "@/components/upload/manual-entry-form";
import { TargetsByDocument } from "@/components/upload/targets-by-document";
import { ManualTargetEditor } from "@/components/upload/manual-target-editor";
import { CategoryConfig } from "@/components/upload/category-config";
import { AnalysisEstimate } from "@/components/upload/analysis-estimate";
import { DocumentPipeline } from "@/components/upload/document-pipeline";

// ─── Component ───────────────────────────────────────────────────────────────

export default function UploadPage() {
  const router = useRouter();

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

  // ─── Local state ────────────────────────────────────────────────────────
  const [country, setCountry] = useState("");
  const [currentText, setCurrentText] = useState("");
  const [currentDoc, setCurrentDoc] = useState<PolicyDocumentType>("NDC");
  const [currentLabel, setCurrentLabel] = useState("");
  const [customDocName, setCustomDocName] = useState("");
  const [mode, setMode] = useState<"upload" | "manual">("upload");
  const [uploadMode, setUploadMode] = useState<"policy" | "list" | "btr">("policy");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [btrParsedData, setBtrParsedData] = useState<BtrData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ─── Derived values ─────────────────────────────────────────────────────
  const estimate = useMemo(() => {
    const n = targets.length;
    const cats = categories.activeNbs.length + categories.activeSectors.length + CROSS_CUTTING_THEMES_COUNT;
    if (n === 0) return null;
    const quantCalls = n;
    const classCalls = n * cats;
    const decompCalls = n;
    const docTypes = new Set(targets.map((t) => t.sourceDocument)).size;
    const estPairs = docTypes > 1 ? Math.floor((n * n) / (docTypes * 2)) : 0;
    const totalCalls = quantCalls + classCalls + decompCalls + estPairs;
    const estCost = totalCalls * COST_PER_CALL;
    return { totalCalls, estCost, estPairs, docTypes };
  }, [targets, categories.activeNbs.length, categories.activeSectors.length]);

  // ─── Manual entry ───────────────────────────────────────────────────────
  function handleAddTarget() {
    if (!currentText.trim()) return;
    const needsCustomName = currentDoc === "SECTORAL" || currentDoc === "OTHER";
    const label =
      currentLabel.trim() ||
      (needsCustomName && customDocName.trim()
        ? `${customDocName.trim()} ${targets.filter((t) => t.sourceDocument === currentDoc).length + 1}`
        : `Target ${targets.length + 1}`);
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

    if (isExcel) {
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
            throw new Error(body.error || "Failed to parse BTR file");
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
            d.id === docId ? { ...d, status: "error" as const, error: "No targets found in file" } : d
          ));
        }
      };
      reader.readAsText(file);
    }
  }, [setTargets]);

  // ─── Unified drop/input handlers ───────────────────────────────────────
  function handleUnifiedDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const docs = files.filter((f) => /\.(pdf|docx|txt)$/i.test(f.name));
    const others = files.filter((f) => /\.(csv|tsv|xlsx?)$/i.test(f.name));
    // Multi-file extraction: queue all doc files
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
    // Process next in queue if available
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

  // ─── Submit ─────────────────────────────────────────────────────────────
  async function runAnalysis() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: country || "Unknown",
          targets,
          nbsCategories: categories.activeNbs.map(({ id, name, description }) => ({
            id, name, description,
          })),
          sectors: categories.activeSectors.map(({ id, name, description }) => ({
            id, name, description,
          })),
          ...(btrParsedData ? { btrData: btrParsedData } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to start analysis");
      }
      const { analysisId } = await res.json();
      router.push(`/analysis/${analysisId}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Unexpected error");
      setSubmitting(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 sticky top-0 bg-white z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-4">
              <Image
                src="/undp-logo.png"
                alt="UNDP"
                width={48}
                height={72}
                className="h-12 w-auto"
              />
              <div>
                <p className="text-sm font-medium text-[var(--undp-black)]">
                  Policy Coherence Tracker
                </p>
                <p className="text-xs text-[var(--undp-gray)]">
                  New Analysis
                </p>
              </div>
            </Link>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <Link
              href="/dashboard"
              className="text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/"
              className="text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors"
            >
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-6 py-8 w-full">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[var(--undp-black)] mb-1">
            {targets.length > 0 ? "New analysis" : "Upload Policy Targets"}
          </h1>
          {targets.length > 0 ? (
            <p className="text-sm text-[var(--undp-gray)]">
              {targets.length} target{targets.length !== 1 ? "s" : ""} across{" "}
              {new Set(targets.map((t) => t.sourceDocument)).size} document type
              {new Set(targets.map((t) => t.sourceDocument)).size !== 1 ? "s" : ""}
            </p>
          ) : (
            <p className="text-sm text-[var(--undp-gray)] leading-relaxed max-w-2xl">
              Upload policy documents (PDF/DOCX), CSV/Excel target lists, or raw BTR Excel
              sheets. You may also add targets manually if needed.
            </p>
          )}
        </div>

        {/* Country */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-[var(--undp-black)] mb-1.5">
            Country
          </label>
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="e.g. Mongolia"
            className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)] focus:ring-1 focus:ring-[var(--undp-blue)]"
          />
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode("upload")}
            className={`px-4 py-2 text-sm rounded-md border transition-colors ${
              mode === "upload"
                ? "bg-[var(--undp-blue)] text-white border-transparent"
                : "border-gray-300 text-[var(--undp-gray)] hover:border-gray-400"
            }`}
          >
            Upload
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`px-4 py-2 text-sm rounded-md border transition-colors ${
              mode === "manual"
                ? "bg-[var(--undp-blue)] text-white border-transparent"
                : "border-gray-300 text-[var(--undp-gray)] hover:border-gray-400"
            }`}
          >
            Manual Entry
          </button>
        </div>

        {/* Manual entry */}
        {mode === "manual" && (
          <ManualEntryForm
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

        {/* Upload */}
        {mode === "upload" && (
          <div className="mb-6 space-y-4">
            <DocumentUploadZone
              uploadMode={uploadMode}
              onUploadModeChange={setUploadMode}
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
            />

            {extraction.extractError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-700">{extraction.extractError}</p>
              </div>
            )}

            {/* Review extracted targets */}
            {extraction.extractedItems.length > 0 && (
              <ExtractReviewPanel
                items={extraction.extractedItems}
                fileName={extraction.extractFileName}
                onToggleItem={extraction.toggleItem}
                onKeepAll={extraction.keepAll}
                onRemoveAll={extraction.removeAll}
                onUpdateItem={extraction.updateItem}
                onAddManual={extraction.addManualExtractedItem}
                onAccept={handleAcceptExtraction}
                onDiscard={extraction.discardExtraction}
                manualLabel={extraction.extractManualLabel}
                onManualLabelChange={extraction.setExtractManualLabel}
                manualText={extraction.extractManualText}
                onManualTextChange={extraction.setExtractManualText}
              />
            )}

            <DocumentPipeline
              uploadedDocs={uploadedDocs}
              onRemoveDoc={removeDoc}
            />
          </div>
        )}

        {/* Error display */}
        {submitError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        )}

        {/* Editing manual targets */}
        {editingManualTargets && (
          <ManualTargetEditor
            docType={editingManualTargets.docType}
            targets={editingManualTargets.targets}
            onUpdate={updateEditingManualTarget}
            onRemove={removeFromEditingManual}
            onSave={saveManualTargetsEdits}
          />
        )}

        {/* Targets grouped by document */}
        {targets.length > 0 && (
          <div className="mb-8">
            <TargetsByDocument
              targetsByDocument={targetsByDocument}
              expandedGroups={expandedGroups}
              onToggleExpand={toggleExpanded}
              onRemoveTarget={removeTarget}
              extractionBackup={extractionBackup}
              onRestoreExtractionReview={handleRestoreExtractionReview}
              onStartEditManualTargets={startEditManualTargets}
            />
          </div>
        )}

        {/* Empty state */}
        {targets.length === 0 && !editingManualTargets && (
          <div className="text-center py-16 text-[var(--undp-gray)]">
            <p className="text-lg mb-2">No targets added yet</p>
            <p className="text-sm">
              Upload files (documents, CSV, or raw BTR Excel) or add targets manually above.
            </p>
          </div>
        )}

        {/* Analysis configuration */}
        {targets.length > 0 && (
          <CategoryConfig
            nbsCategories={categories.nbsCategories}
            sectors={categories.sectors}
            activeNbs={categories.activeNbs}
            activeSectors={categories.activeSectors}
            showCategories={categories.showCategories}
            onToggleShow={() => categories.setShowCategories(!categories.showCategories)}
            toggleCategory={categories.toggleCategory}
            removeCategory={categories.removeCategory}
            addingTo={categories.addingTo}
            onSetAddingTo={categories.setAddingTo}
            newCatName={categories.newCatName}
            onNewCatNameChange={categories.setNewCatName}
            newCatDesc={categories.newCatDesc}
            onNewCatDescChange={categories.setNewCatDesc}
            onAddCustomCategory={categories.addCustomCategory}
          />
        )}

        {/* Run Analysis */}
        {targets.length > 0 && (
          <AnalysisEstimate
            targetCount={targets.length}
            activeNbsCount={categories.activeNbs.length}
            activeSectorsCount={categories.activeSectors.length}
            estimate={estimate}
            hasBtrData={!!btrParsedData}
            submitting={submitting}
            onRunAnalysis={runAnalysis}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 mt-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 text-sm text-[var(--undp-gray)]">
          United Nations Development Programme · CPC Tracker
        </div>
      </footer>
    </div>
  );
}
