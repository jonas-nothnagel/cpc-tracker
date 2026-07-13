import { createHash, timingSafeEqual } from "crypto";
import { notFound } from "next/navigation";

import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { aggregate } from "@/lib/analytics/aggregate";
import { lastMonths } from "@/lib/analytics/paths";
import { readAnalyticsEvents } from "@/lib/analytics/store";

/**
 * Internal usage-analytics dashboard (dev/ops tool; never linked from
 * user-facing navigation). Token-gated: requires ?key= matching the
 * server-only ANALYTICS_DASHBOARD_TOKEN env var. Unset token or wrong key
 * → 404, so the route neither works nor advertises itself unless a
 * deployment explicitly enables it.
 *
 * Aggregation happens server-side; only the identifier-free summary is
 * passed to the client component.
 *
 * REMOVABLE SYSTEM: see src/lib/analytics/README.md.
 */

export const dynamic = "force-dynamic";

const MONTHS_DEFAULT = 3;
const MONTHS_MAX = 12;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = process.env.ANALYTICS_DASHBOARD_TOKEN;
  const key = first(params.key);
  if (!token || !key || !tokenMatches(key, token)) {
    notFound();
  }

  const months = clampMonths(first(params.months));
  const events = readAnalyticsEvents(lastMonths(months));
  const summary = aggregate(events);
  const initialView = first(params.view) === "traffic" ? "traffic" : "usage";

  return (
    <AnalyticsDashboard
      summary={summary}
      months={months}
      initialView={initialView}
    />
  );
}

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Constant-time compare over fixed-length digests (input lengths vary). */
function tokenMatches(key: string, token: string): boolean {
  const a = createHash("sha256").update(key).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b);
}

function clampMonths(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : MONTHS_DEFAULT;
  if (!Number.isFinite(n)) return MONTHS_DEFAULT;
  return Math.min(Math.max(n, 1), MONTHS_MAX);
}
