import { NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { IS_SERVERLESS } from "@/lib/upload/boot";
import { createDraft } from "@/lib/upload/draft";

/**
 * POST /api/upload
 *
 * Starts an upload: a draft under a new analysis id, holding the country
 * typed so far and the language the page is in. Its documents, edits and
 * readings are kept with it (see src/lib/upload/draft.ts).
 */
export async function POST(request: NextRequest) {
  if (IS_SERVERLESS) {
    return NextResponse.json(
      { error: "Uploads need a server that can run Python.", code: "unavailable" },
      { status: 501 },
    );
  }
  let body: { country?: unknown; locale?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // An empty body starts an empty draft.
  }
  const locale = routing.locales.find((l) => l === body?.locale) ?? routing.defaultLocale;
  const draft = createDraft({ country: typeof body?.country === "string" ? body.country : "", locale });
  return NextResponse.json({ draft }, { status: 201 });
}
