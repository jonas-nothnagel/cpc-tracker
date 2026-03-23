import type { PolicyDocumentType } from "@/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TargetRow {
  text: string;
  sourceDocument: PolicyDocumentType;
  sourceLabel: string;
  source?: "extraction" | "manual" | "file";
}

export interface ColumnMapping {
  textCol: number;
  labelCol: number;
  docTypeCol: number;
}

export interface ParsedPreview {
  rows: TargetRow[];
  delimiter: string;
  hasHeader: boolean;
  columns: ColumnMapping;
  headerLabels: string[];
  skippedRows: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Detect the most likely delimiter from the first line of text. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split("\n")[0];
  const tabs = (firstLine.match(/\t/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  if (tabs > 0 && tabs >= semis && tabs >= commas) return "\t";
  if (semis > 0 && semis >= commas) return ";";
  return ",";
}

/** Parse CSV/TSV text respecting quoted fields (RFC 4180). */
export function parseDelimited(text: string, delimiter: string): string[][] {
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
export function matchDocType(raw: string): PolicyDocumentType {
  const lower = raw.toLowerCase().trim();
  for (const [keyword, type] of Object.entries(KNOWN_DOC_TYPES)) {
    if (lower === keyword || lower.startsWith(keyword)) return type;
  }
  return "OTHER";
}

/** Detect column roles from a header row. */
export function detectColumns(headers: string[]): ColumnMapping {
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
export function looksLikeHeader(row: string[]): boolean {
  const joined = row.join(" ").toLowerCase();
  return (
    (joined.includes("target") || joined.includes("text")) &&
    (joined.includes("type") || joined.includes("source") || joined.includes("name"))
  );
}

/** Parse pasted text into targets with auto-detection of format. */
export function smartParse(text: string): ParsedPreview | null {
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
    const colCount = dataRows[0]?.length ?? 0;
    if (colCount >= 4) {
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
