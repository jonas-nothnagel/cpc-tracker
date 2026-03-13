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
  source?: "extraction" | "manual" | "file";
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
  const [mode, setMode] = useState<"upload" | "manual">("upload");

  // Unified file upload
  const [uploadMode, setUploadMode] = useState<"policy" | "list" | "btr">("policy");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [btrParsedData, setBtrParsedData] = useState<BtrData | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractedItems, setExtractedItems] = useState<
    { text: string; label: string; sourceDocument: string; accepted: boolean }[]
  >([]);
  const [extractFileName, setExtractFileName] = useState("");
  const [extractDocType, setExtractDocType] = useState<PolicyDocumentType>("SECTORAL");
  const [extractDocLabel, setExtractDocLabel] = useState("");
  const [extractError, setExtractError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<PolicyDocumentType>>(new Set());
  const TARGETS_PREVIEW = 5;
  const [extractManualLabel, setExtractManualLabel] = useState("");
  const [extractManualText, setExtractManualText] = useState("");
  const [editingManualTargets, setEditingManualTargets] = useState<{
    docType: PolicyDocumentType;
    targets: TargetRow[];
  } | null>(null);
  const [extractionBackup, setExtractionBackup] = useState<{
    items: { text: string; label: string; sourceDocument: string; accepted: boolean }[];
    fileName: string;
    docLabel: string;
    addedTargets: TargetRow[];
  } | null>(null);

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

  const targetsByDocument = useMemo(() => {
    const groups: { docType: PolicyDocumentType; targets: { t: TargetRow; idx: number }[] }[] = [];
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
        source: "manual",
      },
    ]);
    setCurrentText("");
    setCurrentLabel("");
  }

  function removeTarget(index: number) {
    setTargets(targets.filter((_, i) => i !== index));
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
  }, []);

  function handleUnifiedDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const docs = files.filter((f) => /\.(pdf|docx|txt)$/i.test(f.name));
    const others = files.filter((f) => /\.(csv|tsv|xlsx?)$/i.test(f.name));
    if (docs.length > 0) handleDocExtract(docs[0]);
    for (const file of others) handleFile(file);
  }

  function handleUnifiedFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const docs = files.filter((f) => /\.(pdf|docx|txt)$/i.test(f.name));
    const others = files.filter((f) => /\.(csv|tsv|xlsx?)$/i.test(f.name));
    if (docs.length > 0) handleDocExtract(docs[0]);
    for (const file of others) handleFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const uploadModeAccept = uploadMode === "policy"
    ? ".pdf,.docx,.txt"
    : uploadMode === "list"
    ? ".csv,.tsv"
    : ".xlsx,.xls";

  function removeDoc(docId: string) {
    const doc = uploadedDocs.find((d) => d.id === docId);
    if (doc?.fileType === "btr") setBtrParsedData(null);
    setUploadedDocs((prev) => prev.filter((d) => d.id !== docId));
  }

  // ─── Document extraction ─────────────────────────────────────────────────

  async function handleDocExtract(file: File) {
    setExtracting(true);
    setExtractError(null);
    setExtractedItems([]);
    setExtractFileName(file.name);

    const form = new FormData();
    form.append("file", file);
    form.append("docType", extractDocType);
    form.append("sourceDocument", extractDocType);

    try {
      const res = await fetch("/api/extract", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Extraction failed");
      }
      const data = await res.json();
      const rawItems = data.items || [];
      const items = rawItems.map((item: { text: string; label: string; sourceDocument: string }) => ({
        text: item.text,
        label: item.label,
        sourceDocument: item.sourceDocument,
        accepted: true,
      }));
      setExtractedItems(items);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  function addManualExtractedItem() {
    if (!extractManualText.trim()) return;
    const acceptedCount = extractedItems.filter((i) => i.accepted).length;
    setExtractedItems((prev) => [
      ...prev,
      {
        text: extractManualText.trim(),
        label: extractManualLabel.trim() || `Target ${acceptedCount + 1}`,
        sourceDocument: extractDocType,
        accepted: true,
      },
    ]);
    setExtractManualLabel("");
    setExtractManualText("");
  }

  function addExtractedToTargets() {
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
    setExtractedItems([]);
    setExtractFileName("");
    setExtractDocLabel("");
  }

  function restoreExtractionReview() {
    if (!extractionBackup) return;
    setTargets((prev) =>
      prev.filter(
        (t) =>
          !extractionBackup.addedTargets.some(
            (a) => a.text === t.text && a.sourceLabel === t.sourceLabel
          )
      )
    );
    setExtractedItems(extractionBackup.items);
    setExtractFileName(extractionBackup.fileName);
    setExtractDocLabel(extractionBackup.docLabel);
    setExtractionBackup(null);
  }

  function startEditManualTargets(docType: PolicyDocumentType) {
    const manualTargets = targets.filter(
      (t) => t.sourceDocument === docType && t.source === "manual"
    );
    if (manualTargets.length === 0) return;
    setTargets((prev) =>
      prev.filter((t) => !(t.sourceDocument === docType && t.source === "manual"))
    );
    setEditingManualTargets({ docType, targets: manualTargets });
  }

  function saveManualTargetsEdits() {
    if (!editingManualTargets) return;
    setTargets((prev) => [...prev, ...editingManualTargets.targets].slice(0, MAX_TARGETS));
    setEditingManualTargets(null);
  }

  function updateEditingManualTarget(idx: number, updates: Partial<TargetRow>) {
    if (!editingManualTargets) return;
    setEditingManualTargets({
      ...editingManualTargets,
      targets: editingManualTargets.targets.map((t, i) =>
        i === idx ? { ...t, ...updates } : t
      ),
    });
  }

  function removeFromEditingManual(idx: number) {
    if (!editingManualTargets) return;
    const newTargets = editingManualTargets.targets.filter((_, i) => i !== idx);
    setEditingManualTargets(
      newTargets.length > 0 ? { ...editingManualTargets, targets: newTargets } : null
    );
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
          <h1 className="text-2xl font-semibold text-[var(--undp-black)] mb-1">
            {targets.length > 0 ? "New analysis" : "Upload Policy Targets"}
          </h1>
          {targets.length > 0 ? (
            <p className="text-sm text-[var(--undp-gray)]">
              {targets.length} target{targets.length !== 1 ? "s" : ""} across{" "}
              {new Set(targets.map((t) => t.sourceDocument)).size} document type{new Set(targets.map((t) => t.sourceDocument)).size !== 1 ? "s" : ""}
            </p>
          ) : (
            <p className="text-sm text-[var(--undp-gray)] leading-relaxed max-w-2xl">
              Upload policy documents (PDF/DOCX), CSV/Excel target lists, or raw BTR Excel
              sheets. You may also add targets manually if needed.
            </p>
          )}
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

        {/* ─── Upload (unified) ──────────────────────────────────── */}
        {mode === "upload" && (
          <div className="mb-6 space-y-4">
            <div className="space-y-4">

              {/* ── File type cards ── */}
              <div className="grid grid-cols-3 gap-3">
                {([
                  { id: "policy" as const, title: "Policy document", subtitle: "PDF or DOCX — targets extracted automatically" },
                  { id: "list" as const, title: "Target list", subtitle: "CSV or TSV with text, type, label columns" },
                  { id: "btr" as const, title: "BTR Excel sheet", subtitle: "XLSX — emissions, mitigation, projections data" },
                ] as const).map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setUploadMode(card.id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      uploadMode === card.id
                        ? "border-[var(--undp-blue)] bg-blue-50/40"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <p className={`text-sm font-semibold mb-0.5 ${uploadMode === card.id ? "text-[var(--undp-blue)]" : "text-[var(--undp-black)]"}`}>
                      {card.title}
                    </p>
                    <p className="text-xs text-[var(--undp-gray)] leading-snug">
                      {card.subtitle}
                    </p>
                  </button>
                ))}
              </div>

              {/* ── Policy doc type selector (only shown for policy mode) ── */}
              {uploadMode === "policy" && (
                <div className="flex items-end gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
                      Document type
                    </label>
                    <select
                      value={extractDocType}
                      onChange={(e) => setExtractDocType(e.target.value as PolicyDocumentType)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[var(--undp-blue)]"
                    >
                      {DOCUMENT_TYPES.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 max-w-[200px]">
                    <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
                      Label prefix <span className="font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={extractDocLabel}
                      onChange={(e) => setExtractDocLabel(e.target.value)}
                      placeholder="e.g. NDC Target, NBT"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[var(--undp-blue)]"
                    />
                  </div>
                </div>
              )}

              {/* ── Drop zone ── */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleUnifiedDrop}
                onClick={() => !extracting && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl text-center cursor-pointer transition-all py-10 ${
                  dragging
                    ? "border-[var(--undp-blue)] bg-blue-50/50"
                    : "border-gray-300 hover:border-gray-400 bg-white"
                } ${extracting ? "pointer-events-none opacity-60" : ""}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={uploadModeAccept}
                  multiple
                  onChange={handleUnifiedFileInput}
                  className="hidden"
                />
                <svg className="mx-auto mb-3 text-[var(--undp-gray)]" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p className="text-sm text-[var(--undp-black)] mb-0.5">
                  Drag and drop your file here, or{" "}
                  <span className="text-[var(--undp-blue)]">browse</span>
                </p>
                <p className="text-xs text-[var(--undp-gray)]">
                  {uploadMode === "policy" && "PDF, DOCX accepted"}
                  {uploadMode === "list" && "CSV, TSV accepted"}
                  {uploadMode === "btr" && "XLSX accepted"}
                </p>
              </div>

              {extracting && (
                <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200">
                  <div className="w-5 h-5 border-2 border-[var(--undp-blue)] border-t-transparent rounded-full animate-spin shrink-0" />
                  <div>
                    <p className="text-sm text-[var(--undp-black)]">
                      Extracting from <strong>{extractFileName}</strong>...
                    </p>
                    <p className="text-xs text-[var(--undp-gray)]">
                      This may take 1–2 minutes depending on document length.
                    </p>
                  </div>
                </div>
              )}

              {extractError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-700">{extractError}</p>
                </div>
              )}

              {/* ── Review extracted targets ── */}
              {extractedItems.length > 0 && (() => {
                const keptCount = extractedItems.filter((i) => i.accepted).length;
                return (
                  <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">

                    {/* Header */}
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--undp-black)]">Review extracted targets</h3>
                        <p className="text-xs text-[var(--undp-gray)] mt-0.5">
                          {keptCount} of {extractedItems.length} kept · {extractFileName}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setExtractedItems((prev) => prev.map((i) => ({ ...i, accepted: true })))}
                          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:border-gray-300 transition-colors text-[var(--undp-black)]"
                        >
                          Keep all
                        </button>
                        <button
                          type="button"
                          onClick={() => setExtractedItems((prev) => prev.map((i) => ({ ...i, accepted: false })))}
                          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:border-gray-300 transition-colors text-[var(--undp-black)]"
                        >
                          Remove all
                        </button>
                      </div>
                    </div>

                    {/* Single list */}
                    <div className="divide-y divide-gray-100">
                      {extractedItems.map((item, idx) => (
                        <div
                          key={idx}
                          className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                            item.accepted ? "hover:bg-gray-50/40" : "bg-gray-50/60"
                          }`}
                        >
                          {/* Drag handle */}
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="shrink-0 mt-1 text-gray-300 cursor-grab select-none"
                          >
                            <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                            <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                            <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
                          </svg>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={item.label}
                              onChange={(e) =>
                                setExtractedItems((prev) =>
                                  prev.map((it, i) => (i === idx ? { ...it, label: e.target.value } : it))
                                )
                              }
                              disabled={!item.accepted}
                              className={`w-full text-sm font-semibold bg-transparent border-0 px-0 py-0 focus:outline-none focus:ring-0 ${
                                item.accepted ? "text-[var(--undp-black)]" : "line-through text-gray-400"
                              }`}
                            />
                            <textarea
                              value={item.text}
                              onChange={(e) =>
                                setExtractedItems((prev) =>
                                  prev.map((it, i) => (i === idx ? { ...it, text: e.target.value } : it))
                                )
                              }
                              disabled={!item.accepted}
                              rows={2}
                              className={`mt-0.5 w-full text-sm bg-transparent border-0 px-0 py-0 resize-none focus:outline-none focus:ring-0 leading-snug ${
                                item.accepted ? "text-[var(--undp-gray)]" : "line-through text-gray-400"
                              }`}
                            />
                          </div>

                          {/* Status badge + toggle */}
                          <div className="shrink-0 flex items-center gap-2 mt-0.5">
                            {item.accepted ? (
                              <>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                                  Keep
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExtractedItems((prev) =>
                                      prev.map((it, i) => (i === idx ? { ...it, accepted: false } : it))
                                    )
                                  }
                                  className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:border-gray-300 text-green-600 transition-colors"
                                  title="Remove"
                                >
                                  ✓
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="text-[10px] px-2 py-0.5 rounded-full text-red-500 font-medium">
                                  Removed
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExtractedItems((prev) =>
                                      prev.map((it, i) => (i === idx ? { ...it, accepted: true } : it))
                                    )
                                  }
                                  className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:border-gray-300 text-gray-400 hover:text-[var(--undp-black)] transition-colors"
                                  title="Restore"
                                >
                                  ↩
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Manual add inline */}
                    <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40">
                      <p className="text-xs font-medium text-[var(--undp-gray)] mb-2">
                        Add a target that wasn&apos;t extracted
                      </p>
                      <textarea
                        value={extractManualText}
                        onChange={(e) => setExtractManualText(e.target.value)}
                        placeholder="Target text..."
                        rows={2}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addManualExtractedItem();
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-[var(--undp-blue)] focus:ring-1 focus:ring-[var(--undp-blue)]"
                      />
                      <div className="flex items-center justify-between mt-2">
                        <input
                          type="text"
                          value={extractManualLabel}
                          onChange={(e) => setExtractManualLabel(e.target.value)}
                          placeholder="Label (optional)"
                          className="w-44 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[var(--undp-blue)]"
                        />
                        <button
                          type="button"
                          onClick={addManualExtractedItem}
                          disabled={!extractManualText.trim()}
                          className="px-3 py-1.5 text-sm bg-[var(--undp-blue)] text-white rounded-lg hover:bg-[var(--undp-blue-dark)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          + Add
                        </button>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-3 border-t border-gray-200 bg-white flex items-center justify-between sticky bottom-0 rounded-b-xl">
                      <p className="text-sm text-[var(--undp-gray)]">
                        <strong className="text-[var(--undp-black)]">{keptCount}</strong> target{keptCount !== 1 ? "s" : ""} will be added to this analysis
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setExtractedItems([]);
                            setExtractFileName("");
                          }}
                          className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:border-gray-300 transition-colors text-[var(--undp-black)]"
                        >
                          Discard
                        </button>
                        <button
                          type="button"
                          onClick={addExtractedToTargets}
                          disabled={keptCount === 0}
                          className="px-4 py-2 text-sm bg-[var(--undp-blue)] text-white rounded-lg hover:bg-[var(--undp-blue-dark)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Add {keptCount} target{keptCount !== 1 ? "s" : ""} →
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })()}

            </div>

            {/* Document pipeline (CSV/Excel uploads) */}
            {uploadedDocs.length > 0 && (
              <div className="mt-4 border border-gray-200 rounded-xl bg-white overflow-hidden">
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

        {/* ─── Editing manual targets ───────────────────────────── */}
        {editingManualTargets && (
          <div className="mb-8 rounded-lg border-2 border-[var(--undp-blue)]/30 bg-blue-50/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--undp-black)]">
                Edit manual targets — {editingManualTargets.docType}
              </h3>
              <button
                type="button"
                onClick={saveManualTargetsEdits}
                className="px-3 py-1.5 text-sm bg-[var(--undp-blue)] text-white rounded hover:bg-[var(--undp-blue-dark)] transition-colors"
              >
                Done
              </button>
            </div>
            <div className="space-y-2 max-h-[16rem] overflow-y-auto">
              {editingManualTargets.targets.map((t, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 py-2 px-3 rounded border border-gray-200 bg-white"
                >
                  <input
                    type="text"
                    value={t.sourceLabel}
                    onChange={(e) => updateEditingManualTarget(idx, { sourceLabel: e.target.value })}
                    placeholder="Label"
                    className="w-28 shrink-0 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-[var(--undp-blue)]"
                  />
                  <textarea
                    value={t.text}
                    onChange={(e) => updateEditingManualTarget(idx, { text: e.target.value })}
                    placeholder="Target text..."
                    rows={2}
                    className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-200 rounded resize-y focus:outline-none focus:border-[var(--undp-blue)]"
                  />
                  <button
                    type="button"
                    onClick={() => removeFromEditingManual(idx)}
                    className="shrink-0 w-6 h-6 flex items-center justify-center text-[var(--undp-gray)] hover:text-[var(--undp-red)] hover:bg-red-50 rounded"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Targets (card layout) ───────────────────────────── */}
        {targets.length > 0 && (
          <div className="mb-8">
            <div className="space-y-5">
              {targetsByDocument.map(({ docType, targets: docTargets }) => {
                const extractionDocType = extractionBackup?.addedTargets[0]?.sourceDocument;
                const hasExtractionTargets =
                  extractionBackup &&
                  extractionDocType === docType &&
                  docTargets.some(({ t }) =>
                    extractionBackup.addedTargets.some(
                      (a) => a.text === t.text && a.sourceLabel === t.sourceLabel
                    )
                  );
                const hasManualTargets = docTargets.some(({ t }) => t.source === "manual");
                const isExpanded = expandedGroups.has(docType);
                const visible = isExpanded ? docTargets : docTargets.slice(0, TARGETS_PREVIEW);
                const hidden = docTargets.length - TARGETS_PREVIEW;
                return (
                  <div key={docType}>
                    {/* Group header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-white"
                          style={{ backgroundColor: DOC_COLORS[docType] ?? "#a9b1b7" }}
                        >
                          {docType}
                        </span>
                        <span className="text-sm text-[var(--undp-gray)]">
                          {docTargets.length} target{docTargets.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {hasExtractionTargets && (
                          <button type="button" onClick={restoreExtractionReview}
                            className="text-xs text-[var(--undp-blue)] hover:underline">
                            Edit extraction
                          </button>
                        )}
                        {hasManualTargets && (
                          <button type="button" onClick={() => startEditManualTargets(docType)}
                            className="text-xs text-[var(--undp-blue)] hover:underline">
                            Edit manually
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Target rows */}
                    <div className="space-y-1.5">
                      {visible.map(({ t, idx }) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-colors group"
                        >
                          <span
                            className="shrink-0 mt-0.5 px-2 py-0.5 rounded text-[10px] font-medium text-white max-w-[8rem] truncate"
                            style={{ backgroundColor: DOC_COLORS[t.sourceDocument] ?? "#a9b1b7" }}
                            title={t.sourceLabel}
                          >
                            {t.sourceLabel}
                          </span>
                          <p className="flex-1 min-w-0 text-sm text-[var(--undp-black)] leading-snug">
                            {t.text}
                          </p>
                          <button
                            onClick={() => removeTarget(idx)}
                            className="shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center text-gray-300 hover:text-[var(--undp-red)] rounded transition-colors text-sm leading-none opacity-0 group-hover:opacity-100"
                            title="Remove"
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      {/* Show more / less */}
                      {!isExpanded && hidden > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedGroups((prev) => new Set([...prev, docType]))}
                          className="w-full px-3 py-1.5 text-xs text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors text-left"
                        >
                          + {hidden} more target{hidden !== 1 ? "s" : ""}
                        </button>
                      )}
                      {isExpanded && docTargets.length > TARGETS_PREVIEW && (
                        <button
                          type="button"
                          onClick={() => setExpandedGroups((prev) => { const s = new Set(prev); s.delete(docType); return s; })}
                          className="w-full px-3 py-1.5 text-xs text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors text-left"
                        >
                          Show less
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Empty state ────────────────────────────────────── */}
        {targets.length === 0 && !editingManualTargets && (
          <div className="text-center py-16 text-[var(--undp-gray)]">
            <p className="text-lg mb-2">No targets added yet</p>
            <p className="text-sm">
              Upload files (documents, CSV, or raw BTR Excel) or add targets manually above.
            </p>
          </div>
        )}

        {/* ─── Analysis Configuration ─────────────────────────── */}
        {targets.length > 0 && (
          <div className="mb-8">
            <button
              onClick={() => setShowCategories(!showCategories)}
              className="flex items-center gap-2 text-sm font-medium text-[var(--undp-black)] mb-3 hover:text-[var(--undp-blue)] transition-colors w-full"
            >
              <span className="flex-1 text-left">Analysis configuration</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`transition-transform shrink-0 ${showCategories ? "rotate-180" : ""}`}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {!showCategories && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-full bg-gray-100 text-xs text-[var(--undp-gray)]">
                  {activeNbs.length} NBS categories
                </span>
                <span className="px-2.5 py-1 rounded-full bg-gray-100 text-xs text-[var(--undp-gray)]">
                  {activeSectors.length} IPCC sectors
                </span>
                <span className="px-2.5 py-1 rounded-full bg-gray-100 text-xs text-[var(--undp-gray)]">
                  {CROSS_CUTTING_THEMES_COUNT} themes
                </span>
              </div>
            )}

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

        {/* ─── Run Analysis ───────────────────────────────────── */}
        {targets.length > 0 && (
          <div className="bg-[var(--undp-light)] rounded-lg p-5 mb-8">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 min-w-0">
                <ul className="space-y-1 text-sm text-[var(--undp-gray)] mb-3">
                  <li>· Quantitative phrase detection — {targets.length} calls</li>
                  <li>· Classification against NBS, IPCC, themes — {targets.length * (activeNbs.length + activeSectors.length + CROSS_CUTTING_THEMES_COUNT)} calls</li>
                  <li>· Target decomposition — {targets.length} calls</li>
                  <li>
                    · Pairwise alignment —{" "}
                    {(estimate?.docTypes ?? 0) < 2
                      ? "requires 2+ document types"
                      : `~${estimate?.estPairs ?? 0} pairs`}
                  </li>
                  {btrParsedData && <li>· BTR/CTF data integration</li>}
                </ul>
                {(estimate?.docTypes ?? 0) < 2 && (
                  <p className="text-amber-600 text-xs">
                    Add targets from a second document type (e.g. NDC + NBSAP) to enable alignment analysis.
                  </p>
                )}
                {estimate && (
                  <p className="text-xs text-[var(--undp-gray)]">
                    ~{estimate.totalCalls.toLocaleString()} LLM calls · estimated cost{" "}
                    <strong>${estimate.estCost.toFixed(2)}</strong>
                  </p>
                )}
              </div>
              <div className="shrink-0">
                <button
                  onClick={runAnalysis}
                  disabled={submitting}
                  className="px-6 py-2.5 bg-[var(--undp-blue)] text-white text-sm font-medium rounded-md hover:bg-[var(--undp-blue-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {submitting ? "Starting..." : "Run analysis →"}
                </button>
              </div>
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
