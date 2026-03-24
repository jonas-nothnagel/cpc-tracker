/**
 * POST /api/parse-excel-targets
 *
 * Accepts a general target-list Excel file via FormData, runs the Python
 * parser, and returns parsed target rows as JSON (including optional
 * activities and actions fields).
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
      { error: "Excel parsing requires a local environment with Python." },
      { status: 501 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const sheet = (formData.get("sheet") as string | null) ?? "";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.name.match(/\.xlsx?$/i)) {
    return NextResponse.json(
      { error: "Expected an Excel file (.xlsx)" },
      { status: 400 }
    );
  }

  const tmpDir = join(PROJECT_ROOT, "python", "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const tmpPath = join(tmpDir, `${randomUUID().slice(0, 8)}_${safeFileName}`);

  let tmpWritten = false;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(tmpPath, buffer);
    tmpWritten = true;

    const args = [
      "run", "python", "-m", "src.parse_targets_excel",
      "--file", tmpPath,
    ];
    if (sheet) {
      args.push("--sheet", sheet);
    }

    const stdout = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];

      const child = spawn("uv", args, {
        cwd: join(PROJECT_ROOT, "python"),
      });

      child.stdout.on("data", (d: Buffer) => chunks.push(d));
      child.stderr.on("data", (d: Buffer) => errChunks.push(d));

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Excel parsing timed out after 60s"));
      }, 60_000);

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(Buffer.concat(chunks).toString("utf-8"));
        } else {
          reject(
            new Error(
              Buffer.concat(errChunks).toString("utf-8").trim() ||
                `Process exited with code ${code}`
            )
          );
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const parsed = JSON.parse(stdout);
    return NextResponse.json({ targets: parsed, fileName: file.name });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to parse Excel file";
    console.error("Excel target parse error:", message);
    return NextResponse.json(
      { error: `Excel parsing failed: ${message}` },
      { status: 500 }
    );
  } finally {
    if (tmpWritten) {
      try {
        unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
  }
}
