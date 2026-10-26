import { randomUUID } from "crypto";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { detectBtrType, isBtrExcel, mergeBtrData } from "@/lib/upload-helpers";
import { IS_SERVERLESS } from "@/lib/upload/boot";
import { documentName, suggestCode } from "@/lib/upload/documents";
import { analysesDir, documentDir, readDraft, updateDraft } from "@/lib/upload/draft";
import { delimitedRows, parseBtrTables, parseTargetsTable, tableDocuments, type TableRow } from "@/lib/upload/tables";

/**
 * POST /api/upload/[id]/documents   multipart: file
 *
 * Adds one file to a draft. A PDF, Word or text file is kept to be read
 * when the page asks (nothing leaves the server before that). A spreadsheet
 * is parsed at once, without the AI: rows of targets become documents, BTR
 * tables join the draft's reported actions.
 */

const MAX_FILE = 50 * 1024 * 1024;
// Spreadsheets are unpacked in memory by the parser: a smaller cap, as before.
const MAX_TABLE = 15 * 1024 * 1024;
const READ = new Set([".pdf", ".docx", ".txt"]);
const EXCEL = new Set([".xlsx", ".xls"]);
const DELIMITED = new Set([".csv", ".tsv"]);

const fail = (status: number, code: string, error: string) => NextResponse.json({ error, code }, { status });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (IS_SERVERLESS) return fail(501, "unavailable", "Uploads need a server that can run Python.");
  const { id } = await params;
  const draft = readDraft(id);
  if (!draft) return fail(404, "missing", "Draft not found");
  if (draft.started) return fail(409, "started", "The analysis has started");

  let file: File | null = null;
  try {
    file = (await request.formData()).get("file") as File | null;
  } catch {
    return fail(400, "type", "Could not parse form data");
  }
  if (!file || typeof file.arrayBuffer !== "function") return fail(400, "type", "No file provided");
  const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  if (!READ.has(ext) && !EXCEL.has(ext) && !DELIMITED.has(ext)) return fail(400, "type", `Unsupported file type: ${ext}`);
  if (file.size > MAX_FILE) return fail(413, "tooLarge", "The file is larger than 50 MB.");

  if (READ.has(ext)) {
    const docId = `d${draft.nextDoc}`;
    const dir = documentDir(id, docId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `source${ext}`), Buffer.from(await file.arrayBuffer()));
    const updated = updateDraft(id, (d) => {
      const name = documentName(file.name);
      d.documents.push({
        id: docId,
        source: "read",
        fileName: file.name,
        name,
        code: suggestCode(name, d.documents.map((x) => x.code)),
        state: "added",
        targets: [],
      });
      d.nextDoc += 1;
    });
    return NextResponse.json({ draft: updated });
  }

  if (EXCEL.has(ext) && file.size > MAX_TABLE) return fail(413, "tableTooLarge", "The spreadsheet is larger than 15 MB.");

  // A spreadsheet is parsed from a temporary file inside the draft's folder.
  const tmp = join(analysesDir(), id, `upload-${randomUUID().slice(0, 8)}${ext}`);
  try {
    if (EXCEL.has(ext) && isBtrExcel(file.name)) {
      writeFileSync(tmp, Buffer.from(await file.arrayBuffer()));
      const tables = await parseBtrTables(tmp, detectBtrType(file.name));
      const updated = updateDraft(id, (d) => {
        const data = mergeBtrData(d.btr?.data ?? null, tables);
        const measures = data.mitigationMeasures;
        d.btr = {
          fileNames: [...(d.btr?.fileNames ?? []), file.name],
          data,
          actions: Array.isArray(measures) ? measures.length : 0,
        };
      });
      return NextResponse.json({ draft: updated });
    }

    let rows: TableRow[];
    if (EXCEL.has(ext)) {
      writeFileSync(tmp, Buffer.from(await file.arrayBuffer()));
      rows = await parseTargetsTable(tmp);
    } else {
      rows = delimitedRows(await file.text());
    }
    if (rows.length === 0) return fail(422, "noTargets", "No targets were found in the file.");
    const updated = updateDraft(id, (d) => {
      const docs = tableDocuments(rows, file.name, d.documents.map((x) => x.code), d.nextDoc);
      d.documents.push(...docs);
      d.nextDoc += docs.length;
    });
    return NextResponse.json({ draft: updated });
  } catch (err) {
    console.error("Spreadsheet parse error:", err instanceof Error ? err.message : err);
    return fail(500, "generic", "The file could not be read.");
  } finally {
    rmSync(tmp, { force: true });
  }
}
