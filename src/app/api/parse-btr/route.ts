/**
 * POST /api/parse-btr
 *
 * Accepts a BTR/CTF Excel file via FormData, runs the Python parser,
 * and returns the parsed BTR data as JSON.
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { randomUUID } from "crypto";

const PROJECT_ROOT = process.cwd();
const IS_SERVERLESS =
  !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

export async function POST(request: NextRequest) {
  if (IS_SERVERLESS) {
    return NextResponse.json(
      { error: "BTR parsing requires a local environment with Python." },
      { status: 501 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const typeParam = (formData.get("type") as string | null) ?? "auto";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.name.match(/\.xlsx?$/i)) {
    return NextResponse.json(
      { error: "Expected an Excel file (.xlsx)" },
      { status: 400 }
    );
  }

  // Auto-detect: FTC/Support files should only parse support tables.
  // NDC files contain Tables 4-9 (emissions, measures, projections).
  const resolvedType =
    typeParam !== "auto"
      ? typeParam
      : /ftc|support/i.test(file.name)
      ? "support"
      : "ndc";

  const tmpDir = join(PROJECT_ROOT, "python", "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const tmpPath = join(tmpDir, `${randomUUID().slice(0, 8)}_${safeFileName}`);

  let tmpWritten = false;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(tmpPath, buffer);
    tmpWritten = true;

    const stdout = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];

      const child = spawn(
        "uv",
        ["run", "python", "-m", "src.parse_ctf", tmpPath, "--type", resolvedType],
        { cwd: join(PROJECT_ROOT, "python") }
      );

      child.stdout.on("data", (d: Buffer) => chunks.push(d));
      child.stderr.on("data", (d: Buffer) => errChunks.push(d));

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("BTR parsing timed out after 120s"));
      }, 120_000);

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(Buffer.concat(chunks).toString("utf-8"));
        } else {
          reject(new Error(Buffer.concat(errChunks).toString("utf-8").trim() || `Process exited with code ${code}`));
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const parsed = JSON.parse(stdout);
    return NextResponse.json(parsed);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to parse BTR file";
    console.error("BTR parse error:", message);
    return NextResponse.json(
      { error: `BTR parsing failed: ${message}` },
      { status: 500 }
    );
  } finally {
    if (tmpWritten) {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }
}
