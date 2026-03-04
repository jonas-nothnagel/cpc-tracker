"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { PolicyDocumentType, NbsCategory, IpccSector } from "@/types";
import { DOC_COLORS, DOC_LABELS } from "@/lib/utils";
import { NBS_CATEGORIES } from "@/data/nbs-categories";
import { IPCC_SECTORS } from "@/data/sectors";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TargetRow {
  text: string;
  sourceDocument: PolicyDocumentType;
  sourceLabel: string;
}

interface CategoryItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  isCustom: boolean;
}

interface BtrSummary {
  mitigationMeasures: number;
  sectorEmissions: number;
  projections: number;
  technologySupport: number;
  capacityBuilding: number;
}

interface UploadedDoc {
  id: string;
  fileName: string;
  fileType: "targets" | "btr";
  status: "parsing" | "ready" | "error";
  error?: string;
  targetCount?: number;
  docTypeCounts?: Record<string, number>;
  btrSummary?: BtrSummary;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Detect whether an Excel BTR file is an FTC-Support or NDC file from its name. */
function detectBtrType(fileName: string): "support" | "ndc" {
  return /ftc|support/i.test(fileName) ? "support" : "ndc";
}

type BtrData = Record<string, unknown>;

/**
 * Merge two BTR data objects. Arrays are concatenated; sectorEmissions uses
 * whichever has actual data; scalar fields prefer the second value.
 */
function mergeBtrData(existing: BtrData | null, incoming: BtrData): BtrData {
  if (!existing) return incoming;

  const mergeArr = (a: unknown, b: unknown): unknown[] =>
    [...((a as unknown[]) ?? []), ...((b as unknown[]) ?? [])];

  const existingEmissions = existing.sectorEmissions as { bySector: unknown[] } | undefined;
  const incomingEmissions = incoming.sectorEmissions as { bySector: unknown[] } | undefined;
  const aSectors = existingEmissions?.bySector ?? [];
  const bSectors = incomingEmissions?.bySector ?? [];

  return {
    sourceFile: [existing.sourceFile, incoming.sourceFile].filter(Boolean).join(", "),
    progressIndicators: mergeArr(existing.progressIndicators, incoming.progressIndicators),
    mitigationMeasures: mergeArr(existing.mitigationMeasures, incoming.mitigationMeasures),
    sectorEmissions: { bySector: aSectors.length > 0 ? aSectors : bSectors },
    projections: mergeArr(existing.projections, incoming.projections),
    technologySupport: mergeArr(existing.technologySupport, incoming.technologySupport),
    capacityBuilding: mergeArr(existing.capacityBuilding, incoming.capacityBuilding),
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_TARGETS = 150;

const DOCUMENT_TYPES: { value: PolicyDocumentType; label: string; hint?: string }[] = [
  { value: "NDC", label: "NDC (Nationally Determined Contributions)" },
  { value: "NBSAP", label: "NBSAP / National Biodiversity Targets" },
  { value: "NAP", label: "NAP (National Adaptation Plan)" },
  { value: "LDN", label: "LDN (Land Degradation Neutrality)" },
  { value: "SECTORAL", label: "Sectoral Policy", hint: "e.g. Agriculture, Transport, Energy" },
  { value: "OTHER", label: "Other Document" },
];

const COST_PER_CALL = 0.00015; // rough average for gpt-4o-mini via OpenRouter
const CROSS_CUTTING_THEMES_COUNT = 11; // from python/data/categories.json _themes_deprecated

const KNOWN_DOC_TYPES: Record<string, PolicyDocumentType> = {
  ndc: "NDC",
  nbsap: "NBSAP",
  nbt: "NBSAP",
  "national biodiversity": "NBSAP",
  nap: "NAP",
  ldn: "LDN",
  sectoral: "SECTORAL",
  other: "OTHER",
};

// ─── CSV / TSV / Excel parsing ───────────────────────────────────────────────

/** Detect the most likely delimiter from the first line of text. */
function detectDelimiter(text: string): string {
  const firstLine = text.split("\n")[0];
  const tabs = (firstLine.match(/\t/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  if (tabs > 0 && tabs >= semis && tabs >= commas) return "\t";
  if (semis > 0 && semis >= commas) return ";";
  return ",";
}

/** Parse CSV/TSV text respecting quoted fields (RFC 4180). */
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
      row.push(field.trim());
      field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      if (ch === "\r") i++;
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

/** Map a raw document type string to a known PolicyDocumentType. */
function matchDocType(raw: string): PolicyDocumentType {
  const lower = raw.toLowerCase().trim();
  for (const [keyword, type] of Object.entries(KNOWN_DOC_TYPES)) {
    if (lower === keyword || lower.startsWith(keyword)) return type;
  }
  return "OTHER";
}

interface ColumnMapping {
  textCol: number;
  labelCol: number;
  docTypeCol: number;
}

/** Detect column roles from a header row. */
function detectColumns(headers: string[]): ColumnMapping {
  const lower = headers.map((h) => h.toLowerCase().trim());
  let textCol = -1;
  let labelCol = -1;
  let docTypeCol = -1;

  for (let i = 0; i < lower.length; i++) {
    const h = lower[i];
    if (
      h.includes("target text") ||
      h.includes("description") ||
      h === "text"
    ) {
      textCol = i;
    } else if (
      h.includes("target type") ||
      h.includes("document type") ||
      h.includes("doc type") ||
      h === "type" ||
      h === "source document"
    ) {
      docTypeCol = i;
    } else if (
      h.includes("target name") ||
      h.includes("label") ||
      h === "name" ||
      h === "target"
    ) {
      labelCol = i;
    }
  }
  return { textCol, labelCol, docTypeCol };
}

/** Check if a row looks like a header (contains common header keywords). */
function looksLikeHeader(row: string[]): boolean {
  const joined = row.join(" ").toLowerCase();
  return (
    (joined.includes("target") || joined.includes("text")) &&
    (joined.includes("type") || joined.includes("source") || joined.includes("name"))
  );
}

interface ParsedPreview {
  rows: TargetRow[];
  delimiter: string;
  hasHeader: boolean;
  columns: ColumnMapping;
  headerLabels: string[];
  skippedRows: number;
}

/** Parse pasted text into targets with auto-detection of format. */
function smartParse(text: string): ParsedPreview | null {
  if (!text.trim()) return null;

  const delimiter = detectDelimiter(text);
  const allRows = parseDelimited(text, delimiter);
  if (allRows.length === 0) return null;

  const hasHeader = looksLikeHeader(allRows[0]);
  const headerRow = hasHeader ? allRows[0] : [];
  const dataRows = hasHeader ? allRows.slice(1) : allRows;

  let mapping: ColumnMapping;

  if (hasHeader) {
    mapping = detectColumns(headerRow);
  } else {
    // Positional fallback: try common orders
    const colCount = dataRows[0]?.length ?? 0;
    if (colCount >= 4) {
      // label, text, source/url, type  OR  type, label, text, source
      // Heuristic: check if last column values match known doc types
      const lastColSample = dataRows
        .slice(0, 5)
        .map((r) => r[colCount - 1]?.toLowerCase().trim() ?? "");
      const lastIsDocType = lastColSample.some((v) =>
        Object.keys(KNOWN_DOC_TYPES).some((k) => v.startsWith(k))
      );
      if (lastIsDocType) {
        mapping = { labelCol: 0, textCol: 1, docTypeCol: colCount - 1 };
      } else {
        mapping = { docTypeCol: 0, labelCol: 1, textCol: 2 };
      }
    } else if (colCount === 3) {
      mapping = { docTypeCol: 0, labelCol: 1, textCol: 2 };
    } else if (colCount === 2) {
      mapping = { labelCol: 0, textCol: 1, docTypeCol: -1 };
    } else {
      mapping = { textCol: 0, labelCol: -1, docTypeCol: -1 };
    }
  }

  // If we still don't have a text column, pick the longest-average column
  if (mapping.textCol === -1 && dataRows.length > 0) {
    const colCount = dataRows[0].length;
    let bestCol = 0;
    let bestAvg = 0;
    for (let c = 0; c < colCount; c++) {
      const avg =
        dataRows.reduce((sum, r) => sum + (r[c]?.length ?? 0), 0) /
        dataRows.length;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestCol = c;
      }
    }
    mapping.textCol = bestCol;
  }

  let skippedRows = 0;
  const rows: TargetRow[] = [];

  for (const row of dataRows) {
    const text = row[mapping.textCol] ?? "";
    if (!text.trim()) {
      skippedRows++;
      continue;
    }

    const rawLabel = mapping.labelCol >= 0 ? row[mapping.labelCol] ?? "" : "";
    const rawType = mapping.docTypeCol >= 0 ? row[mapping.docTypeCol] ?? "" : "";

    // Clean up multiline labels (e.g., "Water resources\n 1" → "Water resources 1")
    const cleanLabel = rawLabel.replace(/\s*\n\s*/g, " ").trim();

    rows.push({
      text: text.replace(/\s*\n\s*/g, " ").trim(),
      sourceDocument: rawType ? matchDocType(rawType) : "OTHER",
      sourceLabel: cleanLabel || `Target ${rows.length + 1}`,
    });
  }

  return {
    rows,
    delimiter,
    hasHeader,
    columns: mapping,
    headerLabels: headerRow,
    skippedRows,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function UploadPage() {
  const router = useRouter();

  // Targets
  const [country, setCountry] = useState("");
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [currentText, setCurrentText] = useState("");
  const [currentDoc, setCurrentDoc] = useState<PolicyDocumentType>("NDC");
  const [currentLabel, setCurrentLabel] = useState("");
  const [customDocName, setCustomDocName] = useState("");
  const [pasteInput, setPasteInput] = useState("");
  const [pastePreview, setPastePreview] = useState<ParsedPreview | null>(null);
  const [mode, setMode] = useState<"manual" | "paste" | "file">("file");

  // File upload
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [btrParsedData, setBtrParsedData] = useState<BtrData | null>(null);

  // Categories
  const [nbsCategories, setNbsCategories] = useState<CategoryItem[]>(
    NBS_CATEGORIES.map((c) => ({ ...c, enabled: true, isCustom: false }))
  );
  const [sectors, setSectors] = useState<CategoryItem[]>(
    IPCC_SECTORS.map((s) => ({ ...s, enabled: true, isCustom: false }))
  );
  const [showCategories, setShowCategories] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [addingTo, setAddingTo] = useState<"nbs" | "sector" | null>(null);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ─── Derived values ──────────────────────────────────────────────────────

  const activeNbs = useMemo(() => nbsCategories.filter((c) => c.enabled), [nbsCategories]);
  const activeSectors = useMemo(() => sectors.filter((s) => s.enabled), [sectors]);

  const estimate = useMemo(() => {
    const n = targets.length;
    const cats = activeNbs.length + activeSectors.length + CROSS_CUTTING_THEMES_COUNT;
    if (n === 0) return null;
    const quantCalls = n;
    const classCalls = n * cats;
    const decompCalls = n;
    const docTypes = new Set(targets.map((t) => t.sourceDocument)).size;
    const estPairs = docTypes > 1 ? Math.floor((n * n) / (docTypes * 2)) : 0;
    const totalCalls = quantCalls + classCalls + decompCalls + estPairs;
    const estCost = totalCalls * COST_PER_CALL;
    return { totalCalls, estCost, estPairs, docTypes };
  }, [targets, activeNbs.length, activeSectors.length]);

  // ─── Target management ───────────────────────────────────────────────────

  function addTarget() {
    if (!currentText.trim()) return;
    if (targets.length >= MAX_TARGETS) return;
    const needsCustomName = currentDoc === "SECTORAL" || currentDoc === "OTHER";
    const label =
      currentLabel.trim() ||
      (needsCustomName && customDocName.trim()
        ? `${customDocName.trim()} ${targets.filter((t) => t.sourceDocument === currentDoc).length + 1}`
        : `Target ${targets.length + 1}`);
    setTargets([
      ...targets,
      {
        text: currentText.trim(),
        sourceDocument: currentDoc,
        sourceLabel: label,
      },
    ]);
    setCurrentText("");
    setCurrentLabel("");
  }

  function removeTarget(index: number) {
    setTargets(targets.filter((_, i) => i !== index));
  }

  function previewPaste() {
    const result = smartParse(pasteInput);
    setPastePreview(result);
  }

  function addFromPreview() {
    if (!pastePreview) return;
    setTargets([...targets, ...pastePreview.rows].slice(0, MAX_TARGETS));
    setPasteInput("");
    setPastePreview(null);
  }

  // ─── File upload ─────────────────────────────────────────────────────────

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
          setTargets((prev) => [...prev, ...result.rows].slice(0, MAX_TARGETS));
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
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) handleFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeDoc(docId: string) {
    const doc = uploadedDocs.find((d) => d.id === docId);
    if (doc?.fileType === "btr") setBtrParsedData(null);
    setUploadedDocs((prev) => prev.filter((d) => d.id !== docId));
  }

  // ─── Category management ─────────────────────────────────────────────────

  function toggleCategory(type: "nbs" | "sector", id: string) {
    const setter = type === "nbs" ? setNbsCategories : setSectors;
    setter((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
    );
  }

  function removeCategory(type: "nbs" | "sector", id: string) {
    const setter = type === "nbs" ? setNbsCategories : setSectors;
    setter((prev) => prev.filter((c) => c.id !== id));
  }

  function addCustomCategory() {
    if (!newCatName.trim() || !addingTo) return;
    const newItem: CategoryItem = {
      id: `custom_${Date.now()}`,
      name: newCatName.trim(),
      description: newCatDesc.trim(),
      enabled: true,
      isCustom: true,
    };
    if (addingTo === "nbs") {
      setNbsCategories((prev) => [...prev, newItem]);
    } else {
      setSectors((prev) => [...prev, newItem]);
    }
    setNewCatName("");
    setNewCatDesc("");
    setAddingTo(null);
  }

  // ─── Submit ──────────────────────────────────────────────────────────────

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
          nbsCategories: activeNbs.map(({ id, name, description }) => ({
            id,
            name,
            description,
          })),
          sectors: activeSectors.map(({ id, name, description }) => ({
            id,
            name,
            description,
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

  // ─── Render ──────────────────────────────────────────────────────────────

  const showCustomDocField = currentDoc === "SECTORAL" || currentDoc === "OTHER";

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
          <h1 className="text-2xl font-semibold text-[var(--undp-black)] mb-2">
            Upload Policy Targets
          </h1>
          <p className="text-sm text-[var(--undp-gray)] leading-relaxed max-w-2xl">
            Enter your national policy targets from NDCs, NBSAPs, NAPs, and
            other documents. The AI pipeline will classify each target against
            Nature-Based Solutions categories and IPCC sectors, then
            assess pairwise alignment across documents.
          </p>
        </div>

        {/* ─── Country ────────────────────────────────────────── */}
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

        {/* ─── Mode toggle ────────────────────────────────────── */}
        <div className="flex gap-2 mb-6">
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
          <button
            onClick={() => setMode("paste")}
            className={`px-4 py-2 text-sm rounded-md border transition-colors ${
              mode === "paste"
                ? "bg-[var(--undp-blue)] text-white border-transparent"
                : "border-gray-300 text-[var(--undp-gray)] hover:border-gray-400"
            }`}
          >
            Paste CSV / Excel
          </button>
          <button
            onClick={() => setMode("file")}
            className={`px-4 py-2 text-sm rounded-md border transition-colors ${
              mode === "file"
                ? "bg-[var(--undp-blue)] text-white border-transparent"
                : "border-gray-300 text-[var(--undp-gray)] hover:border-gray-400"
            }`}
          >
            Upload File
          </button>
        </div>

        {/* ─── Manual entry ───────────────────────────────────── */}
        {mode === "manual" && (
          <div className="bg-[var(--undp-light)] rounded-lg p-6 mb-6">
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
                  Source Document
                </label>
                <select
                  value={currentDoc}
                  onChange={(e) => {
                    setCurrentDoc(e.target.value as PolicyDocumentType);
                    setCustomDocName("");
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)]"
                >
                  {DOCUMENT_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              {showCustomDocField && (
                <div>
                  <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
                    Document Name
                  </label>
                  <input
                    type="text"
                    value={customDocName}
                    onChange={(e) => setCustomDocName(e.target.value)}
                    placeholder={
                      currentDoc === "SECTORAL"
                        ? "e.g. Transport Policy"
                        : "e.g. National Development Plan"
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)]"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={currentLabel}
                  onChange={(e) => setCurrentLabel(e.target.value)}
                  placeholder="e.g. Biodiversity 1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)]"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
                Target Text
              </label>
              <textarea
                value={currentText}
                onChange={(e) => setCurrentText(e.target.value)}
                placeholder="Paste or type the full target text..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)] resize-y"
              />
            </div>
            <button
              onClick={addTarget}
              disabled={!currentText.trim() || targets.length >= MAX_TARGETS}
              className="px-4 py-2 bg-[var(--undp-blue)] text-white text-sm rounded-md hover:bg-[var(--undp-blue-dark)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Add Target
            </button>
            {targets.length >= MAX_TARGETS && (
              <span className="ml-3 text-xs text-[var(--undp-red)]">
                Maximum {MAX_TARGETS} targets reached
              </span>
            )}
          </div>
        )}

        {/* ─── Paste CSV / Excel ──────────────────────────────── */}
        {mode === "paste" && (
          <div className="bg-[var(--undp-light)] rounded-lg p-6 mb-6">
            <p className="text-xs text-[var(--undp-gray)] mb-4 leading-relaxed">
              Paste data from <strong>Excel</strong>, <strong>CSV</strong>, or
              any delimited format. The parser auto-detects delimiters
              (tab, semicolon, comma), headers, and column mapping.
            </p>
            <textarea
              value={pasteInput}
              onChange={(e) => {
                setPasteInput(e.target.value);
                setPastePreview(null);
              }}
              placeholder={`Paste your data here — for example:\n\nTarget Name;Target Text;Source;Target Type\nNBT 1;Ensure that 30% of land area is conserved...;https://...;NBSAP\nTarget 1;Enhance policies for climate adaptation...;https://...;NAP`}
              rows={7}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:border-[var(--undp-blue)] resize-y mb-4"
            />

            {!pastePreview && (
              <button
                onClick={previewPaste}
                disabled={!pasteInput.trim()}
                className="px-4 py-2 bg-[var(--undp-blue)] text-white text-sm rounded-md hover:bg-[var(--undp-blue-dark)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Preview Parse
              </button>
            )}

            {/* Parse preview */}
            {pastePreview && (
              <div className="mt-4 border border-gray-200 rounded-lg bg-white">
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-[var(--undp-black)]">
                      <strong>{pastePreview.rows.length}</strong> target
                      {pastePreview.rows.length !== 1 && "s"} detected
                    </div>
                    <div className="text-xs text-[var(--undp-gray)] space-x-3">
                      <span>
                        Delimiter:{" "}
                        {pastePreview.delimiter === "\t"
                          ? "tab"
                          : pastePreview.delimiter === ";"
                          ? "semicolon"
                          : "comma"}
                      </span>
                      {pastePreview.hasHeader && <span>Header detected</span>}
                      {pastePreview.skippedRows > 0 && (
                        <span>
                          {pastePreview.skippedRows} empty row
                          {pastePreview.skippedRows !== 1 && "s"} skipped
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Preview table (first 5 rows) */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-2 font-medium text-[var(--undp-gray)] w-24">
                          Type
                        </th>
                        <th className="text-left px-4 py-2 font-medium text-[var(--undp-gray)] w-32">
                          Label
                        </th>
                        <th className="text-left px-4 py-2 font-medium text-[var(--undp-gray)]">
                          Target Text
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pastePreview.rows.slice(0, 5).map((r, i) => (
                        <tr
                          key={i}
                          className="border-b border-gray-50 last:border-0"
                        >
                          <td className="px-4 py-2">
                            <span
                              className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                              style={{
                                backgroundColor:
                                  DOC_COLORS[r.sourceDocument] ?? "#a9b1b7",
                              }}
                            >
                              {r.sourceDocument}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-[var(--undp-black)]">
                            {r.sourceLabel}
                          </td>
                          <td className="px-4 py-2 text-[var(--undp-gray)]">
                            {r.text.length > 120
                              ? r.text.slice(0, 120) + "..."
                              : r.text}
                          </td>
                        </tr>
                      ))}
                      {pastePreview.rows.length > 5 && (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-4 py-2 text-[var(--undp-gray)] text-center"
                          >
                            ... and {pastePreview.rows.length - 5} more
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3">
                  <button
                    onClick={addFromPreview}
                    className="px-4 py-2 bg-[var(--undp-blue)] text-white text-sm rounded-md hover:bg-[var(--undp-blue-dark)] transition-colors"
                  >
                    Add {pastePreview.rows.length} Target
                    {pastePreview.rows.length !== 1 && "s"}
                  </button>
                  <button
                    onClick={() => setPastePreview(null)}
                    className="px-4 py-2 text-sm text-[var(--undp-gray)] hover:text-[var(--undp-black)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Upload File ────────────────────────────────────── */}
        {mode === "file" && (
          <div className="mb-6 space-y-4">
            {/* Drop zone — always visible */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg text-center cursor-pointer transition-all ${
                uploadedDocs.length > 0 ? "p-6" : "p-12"
              } ${
                dragging
                  ? "border-[var(--undp-blue)] bg-blue-50/50"
                  : "border-gray-300 hover:border-gray-400 bg-[var(--undp-light)]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls"
                multiple
                onChange={handleFileInput}
                className="hidden"
              />
              <svg className="mx-auto mb-2 text-[var(--undp-gray)]" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="text-sm text-[var(--undp-black)] mb-0.5">
                Drag and drop files here
              </p>
              <p className="text-xs text-[var(--undp-gray)]">
                <span className="text-[var(--undp-blue)] underline">Browse files</span>
                {" "}&mdash; .csv for policy targets, .xlsx for BTR/CTF data
              </p>
            </div>

            {/* Document pipeline flowchart */}
            {uploadedDocs.length > 0 && (
              <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)]">
                    Document Pipeline
                  </p>
                </div>
                <div className="p-4">
                  {uploadedDocs.map((doc, i) => (
                    <div key={doc.id}>
                      {/* Connector line */}
                      {i > 0 && (
                        <div className="flex justify-center py-1.5">
                          <svg width="2" height="20" className="text-gray-300">
                            <line x1="1" y1="0" x2="1" y2="20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                          </svg>
                        </div>
                      )}
                      {/* Document card */}
                      <div className={`border rounded-lg p-3 transition-all ${
                        doc.status === "error"
                          ? "border-red-200 bg-red-50/50"
                          : doc.status === "parsing"
                          ? "border-gray-200 bg-gray-50/30"
                          : doc.fileType === "btr"
                          ? "border-[var(--undp-blue)]/30 bg-blue-50/30"
                          : "border-green-200 bg-green-50/30"
                      }`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            {/* File icon */}
                            <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                              doc.fileType === "btr" ? "bg-[var(--undp-blue)]/10" : "bg-green-100"
                            }`}>
                              {doc.fileType === "btr" ? (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--undp-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="3" width="18" height="18" rx="2" />
                                  <path d="M9 3v18M3 9h18M3 15h18" />
                                </svg>
                              ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                  <line x1="16" y1="13" x2="8" y2="13" />
                                  <line x1="16" y1="17" x2="8" y2="17" />
                                </svg>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              {/* File name + status */}
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-medium text-[var(--undp-black)] truncate">
                                  {doc.fileName}
                                </p>
                                {doc.status === "parsing" && (
                                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-[var(--undp-gray)] animate-pulse">
                                    Parsing...
                                  </span>
                                )}
                                {doc.status === "ready" && (
                                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                                    Ready
                                  </span>
                                )}
                                {doc.status === "error" && (
                                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                    Error
                                  </span>
                                )}
                              </div>

                              {/* Summary content */}
                              {doc.status === "error" && doc.error && (
                                <p className="text-xs text-red-600">{doc.error}</p>
                              )}

                              {doc.status === "ready" && doc.fileType === "targets" && doc.docTypeCounts && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {Object.entries(doc.docTypeCounts).map(([docType, count]) => (
                                    <span
                                      key={docType}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-white"
                                      style={{ backgroundColor: DOC_COLORS[docType as PolicyDocumentType] ?? "#a9b1b7" }}
                                    >
                                      {docType}
                                      <span className="opacity-80">{count}</span>
                                    </span>
                                  ))}
                                  <span className="text-xs text-[var(--undp-gray)] ml-1">
                                    {doc.targetCount} policy targets
                                  </span>
                                </div>
                              )}

                              {doc.status === "ready" && doc.fileType === "btr" && doc.btrSummary && (
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--undp-gray)]">
                                  {doc.btrSummary.mitigationMeasures > 0 && (
                                    <span>{doc.btrSummary.mitigationMeasures} mitigation measures</span>
                                  )}
                                  {doc.btrSummary.sectorEmissions > 0 && (
                                    <span>{doc.btrSummary.sectorEmissions} emission series</span>
                                  )}
                                  {doc.btrSummary.projections > 0 && (
                                    <span>{doc.btrSummary.projections} projections</span>
                                  )}
                                  {doc.btrSummary.technologySupport > 0 && (
                                    <span>{doc.btrSummary.technologySupport} tech support projects</span>
                                  )}
                                  {doc.btrSummary.capacityBuilding > 0 && (
                                    <span>{doc.btrSummary.capacityBuilding} capacity building</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Remove button */}
                          <button
                            onClick={() => removeDoc(doc.id)}
                            className="shrink-0 text-[var(--undp-gray)] hover:text-[var(--undp-red)] transition-colors text-lg leading-none mt-0.5"
                            title="Remove"
                          >
                            &times;
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Error display ──────────────────────────────────── */}
        {submitError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        )}

        {/* ─── Targets table ──────────────────────────────────── */}
        {targets.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-[var(--undp-black)] mb-4">
              Targets ({targets.length}
              {targets.length >= MAX_TARGETS && ` / ${MAX_TARGETS} max`})
            </h2>
            <div className="bg-[var(--undp-light)] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/80 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 font-medium text-[var(--undp-gray)] w-36">
                      Source
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-[var(--undp-gray)]">
                      Target
                    </th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {targets.map((t, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-100/50 last:border-0"
                    >
                      <td className="px-4 py-2.5 align-top">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
                          style={{
                            backgroundColor:
                              DOC_COLORS[t.sourceDocument] ?? "#a9b1b7",
                          }}
                        >
                          {t.sourceLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--undp-black)] leading-relaxed">
                        {t.text.length > 200
                          ? t.text.slice(0, 200) + "..."
                          : t.text}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => removeTarget(i)}
                          className="text-[var(--undp-gray)] hover:text-[var(--undp-red)] transition-colors text-lg leading-none"
                          title="Remove"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Empty state ────────────────────────────────────── */}
        {targets.length === 0 && (
          <div className="text-center py-16 text-[var(--undp-gray)]">
            <p className="text-lg mb-2">No targets added yet</p>
            <p className="text-sm">
              Use manual entry or paste from Excel / CSV above to add policy
              targets for analysis.
            </p>
          </div>
        )}

        {/* ─── Analysis Configuration ─────────────────────────── */}
        {targets.length > 0 && (
          <div className="mb-8">
            <button
              onClick={() => setShowCategories(!showCategories)}
              className="flex items-center gap-2 text-sm font-medium text-[var(--undp-black)] mb-4 hover:text-[var(--undp-blue)] transition-colors"
            >
              <span
                className="inline-block transition-transform"
                style={{
                  transform: showCategories
                    ? "rotate(90deg)"
                    : "rotate(0deg)",
                }}
              >
                ▸
              </span>
              Analysis Configuration — NBS ({activeNbs.length}), IPCC Sectors ({activeSectors.length}), Themes ({CROSS_CUTTING_THEMES_COUNT})
            </button>

            {showCategories && (
              <div className="bg-[var(--undp-light)] rounded-lg p-6 space-y-6">
                <p className="text-xs text-[var(--undp-gray)] leading-relaxed">
                  Each target will be classified against every enabled NBS
                  category, IPCC sector, and {CROSS_CUTTING_THEMES_COUNT} cross-cutting themes.
                  You can disable NBS/sector categories or add custom ones.
                </p>

                {/* NBS Categories */}
                <div>
                  <h3 className="text-sm font-semibold text-[var(--undp-black)] mb-3">
                    Nature-Based Solutions Categories ({activeNbs.length} active)
                  </h3>
                  <div className="space-y-2">
                    {nbsCategories.map((cat) => (
                      <label
                        key={cat.id}
                        className="flex items-start gap-3 text-sm cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={cat.enabled}
                          onChange={() => toggleCategory("nbs", cat.id)}
                          className="mt-0.5 rounded border-gray-300 text-[var(--undp-blue)] focus:ring-[var(--undp-blue)]"
                        />
                        <div className="flex-1 min-w-0">
                          <span
                            className={
                              cat.enabled
                                ? "text-[var(--undp-black)]"
                                : "text-gray-400 line-through"
                            }
                          >
                            {cat.name}
                          </span>
                          {cat.isCustom && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                removeCategory("nbs", cat.id);
                              }}
                              className="ml-2 text-xs text-gray-400 hover:text-[var(--undp-red)]"
                            >
                              remove
                            </button>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                  {addingTo === "nbs" ? (
                    <div className="mt-3 flex gap-2 items-end">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          placeholder="Category name"
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)]"
                        />
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={newCatDesc}
                          onChange={(e) => setNewCatDesc(e.target.value)}
                          placeholder="Brief description (optional)"
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)]"
                        />
                      </div>
                      <button
                        onClick={addCustomCategory}
                        disabled={!newCatName.trim()}
                        className="px-3 py-1.5 bg-[var(--undp-blue)] text-white text-sm rounded-md disabled:opacity-40"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setAddingTo(null);
                          setNewCatName("");
                          setNewCatDesc("");
                        }}
                        className="px-3 py-1.5 text-sm text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingTo("nbs")}
                      className="mt-3 text-xs text-[var(--undp-blue)] hover:underline"
                    >
                      + Add custom NBS category
                    </button>
                  )}
                </div>

                {/* IPCC Sectors */}
                <div>
                  <h3 className="text-sm font-semibold text-[var(--undp-black)] mb-3">
                    IPCC Sectors ({activeSectors.length} active)
                  </h3>
                  <div className="space-y-2">
                    {sectors.map((sector) => (
                      <label
                        key={sector.id}
                        className="flex items-start gap-3 text-sm cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={sector.enabled}
                          onChange={() => toggleCategory("sector", sector.id)}
                          className="mt-0.5 rounded border-gray-300 text-[var(--undp-blue)] focus:ring-[var(--undp-blue)]"
                        />
                        <div className="flex-1 min-w-0">
                          <span
                            className={
                              sector.enabled
                                ? "text-[var(--undp-black)]"
                                : "text-gray-400 line-through"
                            }
                          >
                            {sector.name}
                          </span>
                          {sector.isCustom && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                removeCategory("sector", sector.id);
                              }}
                              className="ml-2 text-xs text-gray-400 hover:text-[var(--undp-red)]"
                            >
                              remove
                            </button>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                  {addingTo === "sector" ? (
                    <div className="mt-3 flex gap-2 items-end">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          placeholder="Sector name"
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)]"
                        />
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={newCatDesc}
                          onChange={(e) => setNewCatDesc(e.target.value)}
                          placeholder="Brief description (optional)"
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)]"
                        />
                      </div>
                      <button
                        onClick={addCustomCategory}
                        disabled={!newCatName.trim()}
                        className="px-3 py-1.5 bg-[var(--undp-blue)] text-white text-sm rounded-md disabled:opacity-40"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setAddingTo(null);
                          setNewCatName("");
                          setNewCatDesc("");
                        }}
                        className="px-3 py-1.5 text-sm text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingTo("sector")}
                      className="mt-3 text-xs text-[var(--undp-blue)] hover:underline"
                    >
                      + Add custom sector
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── What Happens + Run ─────────────────────────────── */}
        {targets.length > 0 && (
          <div className="border border-gray-200 rounded-lg p-6 mb-8">
            <h3 className="text-sm font-semibold text-[var(--undp-black)] mb-3">
              What happens when you run this analysis
            </h3>
            <div className="text-sm text-[var(--undp-gray)] space-y-2 mb-5">
              <p>
                <strong>{targets.length}</strong> target{targets.length !== 1 && "s"} from{" "}
                <strong>{estimate?.docTypes ?? 0}</strong> document type
                {(estimate?.docTypes ?? 0) !== 1 && "s"} will be processed
                through the AI pipeline:
              </p>
              <ol className="list-decimal list-inside space-y-1 pl-2">
                <li>
                  Quantitative and time-bound phrase detection ({targets.length}{" "}
                  LLM calls)
                </li>
                <li>
                  Classification against {activeNbs.length} NBS categories,{" "}
                  {activeSectors.length} IPCC sectors, and {CROSS_CUTTING_THEMES_COUNT} cross-cutting themes (
                  {targets.length * (activeNbs.length + activeSectors.length + CROSS_CUTTING_THEMES_COUNT)}{" "}
                  LLM calls)
                </li>
                <li>Target decomposition ({targets.length} LLM calls)</li>
                <li>
                  Pairwise alignment assessment
                  {(estimate?.docTypes ?? 0) < 2
                    ? " (requires targets from at least 2 document types)"
                    : ` (~${estimate?.estPairs ?? 0} pairs)`}
                </li>
                {btrParsedData && (
                  <li>BTR/CTF data integration (emissions, measures, projections)</li>
                )}
              </ol>
              {(estimate?.docTypes ?? 0) < 2 && (
                <p className="text-amber-600 text-xs mt-2">
                  Note: Alignment analysis requires targets from at least 2
                  different document types (e.g. NDC + NBSAP). Currently only{" "}
                  {estimate?.docTypes ?? 0} type present.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-[var(--undp-gray)]">
                {estimate && (
                  <>
                    ~{estimate.totalCalls.toLocaleString()} LLM calls · estimated
                    cost ~${estimate.estCost.toFixed(2)} (gpt-4o-mini)
                  </>
                )}
              </div>
              <button
                onClick={runAnalysis}
                disabled={submitting}
                className="px-6 py-2.5 bg-[var(--undp-blue)] text-white text-sm font-medium rounded-md hover:bg-[var(--undp-blue-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Starting..." : "Run Analysis →"}
              </button>
            </div>
          </div>
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
