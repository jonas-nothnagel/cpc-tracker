import { NextRequest, NextResponse } from "next/server";
import type { Target, PolicyDocumentType } from "@/types";

/**
 * POST /api/analyze
 *
 * Accepts an array of targets and a country name.
 * Returns classification results (NBS, themes) and alignment pairs.
 *
 * In production, this will call the LLM pipeline (OpenRouter / Azure OpenAI).
 * Currently returns a placeholder response.
 */

interface AnalyzeRequest {
  country: string;
  targets: {
    text: string;
    sourceDocument: PolicyDocumentType;
    sourceLabel: string;
  }[];
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json();

    if (!body.targets || body.targets.length === 0) {
      return NextResponse.json(
        { error: "No targets provided" },
        { status: 400 }
      );
    }

    // Build Target objects with IDs
    const targets: Target[] = body.targets.map((t, i) => ({
      id: `${t.sourceDocument}_${i + 1}`,
      text: t.text,
      sourceDocument: t.sourceDocument,
      sourceLabel: t.sourceLabel || `Target ${i + 1}`,
      country: body.country || "Unknown",
      isQuantitative: false, // TODO: detect from text
      isTimeBound: false, // TODO: detect from text
    }));

    // TODO: Call LLM pipeline here
    // 1. Thematic classification (each target × each NBS category + theme)
    // 2. Target decomposition (Agent 1)
    // 3. Pairwise alignment (Agent 2)

    return NextResponse.json({
      status: "placeholder",
      message: `Received ${targets.length} targets for ${body.country}. LLM pipeline not yet connected.`,
      targets,
      // thematicClassifications: [],
      // alignmentResults: [],
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

