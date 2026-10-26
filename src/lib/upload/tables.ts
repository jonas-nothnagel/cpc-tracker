import { spawn } from "child_process";
import { join } from "path";
import { smartParse } from "@/lib/csv-parser";
import { KNOWN, cleanText, suggestCode } from "./documents";
import type { DraftDocument } from "./types";

/**
 * Targets and BTR tables that arrive as spreadsheets: parsed at once, on the
 * server, without the AI. A spreadsheet of targets names the document each
 * target comes from; each of those becomes a document of the draft.
 */

/** One row of a spreadsheet of targets. */
export interface TableRow {
  text: string;
  sourceDocument: string;
  sourceLabel?: string;
  activities?: string;
  actions?: string;
}

/** Run one of the pipeline's parsers and read the JSON it prints. */
function runParser(args: string[], timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const child = spawn("uv", ["run", "python", "-m", ...args], { cwd: join(process.cwd(), "python") });
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => err.push(d));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Parsing timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.on("close", (code: number) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(Buffer.concat(err).toString("utf-8").trim() || `Parser exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(out).toString("utf-8")));
      } catch (e) {
        reject(e);
      }
    });
    child.on("error", (e: Error) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function asRows(value: unknown): TableRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      text: cleanText(r.text),
      sourceDocument: cleanText(r.sourceDocument),
      ...(cleanText(r.sourceLabel) ? { sourceLabel: cleanText(r.sourceLabel) } : {}),
      ...(cleanText(r.activities) ? { activities: cleanText(r.activities) } : {}),
      ...(cleanText(r.actions) ? { actions: cleanText(r.actions) } : {}),
    }))
    .filter((r) => r.text);
}

/** The rows of an Excel file of targets. */
export async function parseTargetsTable(path: string, sheet?: string): Promise<TableRow[]> {
  const args = ["src.parse_targets_excel", "--file", path, ...(sheet ? ["--sheet", sheet] : [])];
  return asRows(await runParser(args, 60_000));
}

/** The tables of a BTR (common tabular format) Excel file. */
export async function parseBtrTables(path: string, type: "support" | "ndc"): Promise<Record<string, unknown>> {
  const parsed = await runParser(["src.parse_ctf", path, "--type", type], 120_000);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("BTR parser returned no tables");
  return parsed as Record<string, unknown>;
}

/** The rows of a CSV or TSV file of targets. */
export function delimitedRows(text: string): TableRow[] {
  return asRows(smartParse(text)?.rows ?? []);
}

/** One read document per document the rows name, in the order they first
 *  appear, with ids numbered from `nextDoc` and codes not yet `taken`. */
export function tableDocuments(
  rows: TableRow[],
  fileName: string,
  taken: readonly string[],
  nextDoc: number,
): DraftDocument[] {
  const groups = new Map<string, TableRow[]>();
  for (const row of rows) {
    const key = row.sourceDocument || fileName;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const codes = [...taken];
  return [...groups].map(([value, group], i) => {
    const id = `d${nextDoc + i}`;
    const name = KNOWN[value]?.full && value !== "OTHER" && value !== "SECTORAL" ? KNOWN[value].full : value;
    const code = suggestCode(value in KNOWN ? value : name, codes);
    codes.push(code);
    return {
      id,
      source: "table",
      fileName,
      name,
      code,
      state: "read",
      targets: group.map((row, n) => ({
        key: `${id}-${n + 1}`,
        label: row.sourceLabel ?? "",
        text: row.text,
        ...(row.activities ? { activities: row.activities } : {}),
        ...(row.actions ? { actions: row.actions } : {}),
      })),
    };
  });
}
