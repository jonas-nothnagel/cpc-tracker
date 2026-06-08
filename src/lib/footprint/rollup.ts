import type {
  FootprintMetrics,
  FootprintRollup,
  LedgerEvent,
  RollupBucket,
} from "./types";

/**
 * Aggregate ledger events into totals and breakdowns for the /sustainability
 * dashboard. Pure and deterministic so it is trivially unit-testable.
 */

function emptyBucket(key: string): RollupBucket {
  return {
    key,
    energy_wh: 0,
    water_ml: 0,
    co2_geq: 0,
    minerals_ugsbeq: 0,
    call_count: 0,
    event_count: 0,
  };
}

function addInto(bucket: RollupBucket, event: LedgerEvent): void {
  bucket.energy_wh += event.energy_wh;
  bucket.water_ml += event.water_ml;
  bucket.co2_geq += event.co2_geq;
  bucket.minerals_ugsbeq += event.minerals_ugsbeq;
  bucket.call_count += event.call_count;
  bucket.event_count += 1;
}

function bucketBy(
  events: LedgerEvent[],
  keyFn: (e: LedgerEvent) => string,
): RollupBucket[] {
  const map = new Map<string, RollupBucket>();
  for (const event of events) {
    const key = keyFn(event);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = emptyBucket(key);
      map.set(key, bucket);
    }
    addInto(bucket, event);
  }
  return [...map.values()];
}

const byCo2Desc = (a: RollupBucket, b: RollupBucket) => b.co2_geq - a.co2_geq;

export function rollUp(events: LedgerEvent[]): FootprintRollup {
  const totals = {
    energy_wh: 0,
    water_ml: 0,
    co2_geq: 0,
    minerals_ugsbeq: 0,
    call_count: 0,
    event_count: 0,
  };
  let latestTs: string | null = null;
  for (const event of events) {
    totals.energy_wh += event.energy_wh;
    totals.water_ml += event.water_ml;
    totals.co2_geq += event.co2_geq;
    totals.minerals_ugsbeq += event.minerals_ugsbeq;
    totals.call_count += event.call_count;
    totals.event_count += 1;
    if (latestTs === null || event.ts > latestTs) latestTs = event.ts;
  }

  return {
    totals,
    byModel: bucketBy(events, (e) => e.model).sort(byCo2Desc),
    byComponent: bucketBy(events, (e) => e.component).sort(byCo2Desc),
    byRegion: bucketBy(events, (e) => e.region).sort(byCo2Desc),
    // Day buckets stay in chronological order for the time series.
    byDay: bucketBy(events, (e) => e.ts.slice(0, 10)).sort((a, b) =>
      a.key.localeCompare(b.key),
    ),
    events,
    latestTs,
  };
}

export interface CumulativeComponentSeries {
  /** One point per day: { key: "YYYY-MM-DD", [component]: cumulative value }. */
  points: Array<Record<string, number | string>>;
  /** Components present, ordered by total value descending (stack order). */
  components: string[];
}

/**
 * Cumulative value of one footprint metric over time, split by component, for a
 * stacked area chart. The four resource metrics move proportionally (one model
 * call emits carbon, draws energy, uses water and depletes minerals in a fixed
 * ratio), so charting them against each other is redundant -- but the components
 * have distinct time dynamics: a pipeline run is a large step, chat adds slivers,
 * extraction is different again. The metric is chosen by the caller (a selector
 * on the page). Carry-forward: every point carries the running total for every
 * component so the stacked areas stay continuous.
 */
export function cumulativeByComponent(
  events: LedgerEvent[],
  metric: keyof FootprintMetrics,
): CumulativeComponentSeries {
  const totals = new Map<string, number>();
  for (const e of events) {
    totals.set(e.component, (totals.get(e.component) ?? 0) + e[metric]);
  }
  const components = [...totals.keys()].sort(
    (a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0),
  );

  const perDay = new Map<string, Map<string, number>>();
  for (const e of events) {
    const day = e.ts.slice(0, 10);
    let dayMap = perDay.get(day);
    if (!dayMap) {
      dayMap = new Map();
      perDay.set(day, dayMap);
    }
    dayMap.set(e.component, (dayMap.get(e.component) ?? 0) + e[metric]);
  }
  const days = [...perDay.keys()].sort();

  const running = new Map<string, number>(components.map((c) => [c, 0]));
  const points = days.map((day) => {
    const add = perDay.get(day);
    const point: Record<string, number | string> = { key: day };
    for (const c of components) {
      running.set(c, (running.get(c) ?? 0) + (add?.get(c) ?? 0));
      point[c] = running.get(c) ?? 0;
    }
    return point;
  });

  return { points, components };
}
