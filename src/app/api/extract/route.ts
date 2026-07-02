import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { writeFileSync, mkdirSync, readFileSync, unlinkSync, existsSync, rmdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

/**
 * POST /api/extract
 *
 * Accepts a file upload (PDF, DOCX, or text), runs the Python extraction pipeline,
 * and returns extracted policy items as JSON.
 */

const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const PROJECT_ROOT = process.cwd();
const TMP_DIR = join(PROJECT_ROOT, "python", "tmp");

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MIN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(request: NextRequest) {
  if (IS_SERVERLESS) {
    return NextResponse.json(
      { error: "Document extraction requires a local environment with Python." },
      { status: 501 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Could not parse form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  const docType = (formData.get("docType") as string) || "policy";
  const sourceDocument = (formData.get("sourceDocument") as string) || "SECTORAL";
  const localeRaw = (formData.get("locale") as string) || "en";
  const SUPPORTED_OUTPUT_LANGS = new Set(["en", "es", "mn", "fr"]);
  const outputLanguage = SUPPORTED_OUTPUT_LANGS.has(localeRaw) ? localeRaw : "en";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // File size guard
  if (file.size > MAX_FILE_SIZE) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return NextResponse.json(
      { error: `File too large (${sizeMb} MB). Maximum allowed is 50 MB.` },
      { status: 413 }
    );
  }

  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const runId = randomUUID().slice(0, 8);
  const tmpRunDir = join(TMP_DIR, runId);
  mkdirSync(tmpRunDir, { recursive: true });

  const inputPath = join(tmpRunDir, `input${ext}`);
  const outputPath = join(tmpRunDir, "extracted.json");

  // Dynamic timeout: 5 min base + 1 min per MB
  const fileSizeMb = file.size / (1024 * 1024);
  const timeoutMs = Math.max(MIN_TIMEOUT_MS, Math.ceil(fileSizeMb) * 60 * 1000);
  const timeoutMinutes = Math.round(timeoutMs / 60000);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(inputPath, buffer);

    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        "uv",
        [
          "run", "python", "-m", "src.extract",
          "--file", inputPath,
          "--doc-type", docType,
          "--source-document", sourceDocument,
          "--output", outputPath,
          "--output-language", outputLanguage,
        ],
        {
          cwd: join(PROJECT_ROOT, "python"),
          env: { ...process.env },
          stdio: ["ignore", "pipe", "pipe"],
        }
      );

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Extraction timed out after ${timeoutMinutes} minutes`));
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          // extract.py prints one machine-readable JSON line to stdout for
          // known failure modes (scanned PDF, missing file); surface those
          // as typed errors instead of a raw stderr tail.
          const lastLine = stdout.trim().split("\n").filter(Boolean).pop();
          if (lastLine) {
            try {
              const parsed = JSON.parse(lastLine);
              if (parsed?.error?.code) {
                reject(
                  Object.assign(new Error(parsed.error.code), {
                    structured: parsed.error,
                  })
                );
                return;
              }
            } catch {
              // not a structured error line; fall through
            }
          }
          reject(new Error(`Extraction failed (exit ${code}): ${stderr.slice(-500)}`));
        } else {
          resolve(stdout);
        }
      });
    });

    if (!existsSync(outputPath)) {
      return NextResponse.json(
        { error: "Extraction produced no output. " + result },
        { status: 500 }
      );
    }

    const items = JSON.parse(readFileSync(outputPath, "utf-8"));

    // Read the footprint snapshot written by extract.py (next to the output)
    const footprintPath = outputPath + ".footprint.json";
    let footprint: Record<string, unknown> | null = null;
    if (existsSync(footprintPath)) {
      try {
        footprint = JSON.parse(readFileSync(footprintPath, "utf-8"));
      } catch {
        footprint = null;
      }
    }

    // Run-metadata sidecar: document warnings (e.g. partially scanned PDF)
    // and pipeline self-reports, surfaced next to the extracted targets.
    const metaPath = outputPath + ".meta.json";
    let warnings: Record<string, unknown> | null = null;
    if (existsSync(metaPath)) {
      try {
        warnings = JSON.parse(readFileSync(metaPath, "utf-8"));
      } catch {
        warnings = null;
      }
    }

    return NextResponse.json({ items, fileName: file.name, footprint, warnings });
  } catch (err) {
    const structured = (err as { structured?: Record<string, unknown> })?.structured;
    if (structured && structured.code === "NO_TEXT_LAYER") {
      const { code, ...detail } = structured;
      return NextResponse.json(
        {
          error:
            "No machine-readable text was found in this PDF. The file appears to " +
            "be scanned or image-based; optical character recognition is not " +
            "supported yet. A text-based version of the document is needed.",
          errorCode: code,
          detail,
        },
        { status: 422 }
      );
    }
    const message = err instanceof Error ? err.message : "Extraction failed";
    console.error("Extraction error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    try {
      if (existsSync(inputPath)) unlinkSync(inputPath);
      if (existsSync(outputPath)) unlinkSync(outputPath);
      for (const sidecar of [".footprint.json", ".meta.json"]) {
        const p = outputPath + sidecar;
        if (existsSync(p)) unlinkSync(p);
      }
      if (existsSync(tmpRunDir)) {
        rmdirSync(tmpRunDir);
      }
    } catch {
      // cleanup is best-effort
    }
  }
}
