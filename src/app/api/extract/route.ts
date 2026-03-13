import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { writeFileSync, mkdirSync, readFileSync, unlinkSync, existsSync } from "fs";
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

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
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
        reject(new Error("Extraction timed out after 5 minutes"));
      }, 5 * 60 * 1000);

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
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
    return NextResponse.json({ items, fileName: file.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    console.error("Extraction error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    try {
      if (existsSync(inputPath)) unlinkSync(inputPath);
      if (existsSync(outputPath)) unlinkSync(outputPath);
      if (existsSync(tmpRunDir)) {
        const { rmdirSync } = require("fs");
        rmdirSync(tmpRunDir);
      }
    } catch {
      // cleanup is best-effort
    }
  }
}
