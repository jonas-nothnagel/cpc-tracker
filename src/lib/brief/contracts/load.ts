/**
 * Server side only: the baked contract files beside the country's pipeline
 * outputs (python/output/{country}/{model}/), read once and kept while
 * unchanged on disk.
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { gunzipSync } from "zlib";
import { derivePaths } from "@/lib/dashboard-data";
import { parseContractsFile, type ContractRecord, type ContractsFile } from "./model";

const cache = new Map<string, { mtime: number; value: unknown }>();

function readGzJson(path: string): unknown {
  if (!existsSync(path)) return null;
  const mtime = statSync(path).mtimeMs;
  const hit = cache.get(path);
  if (hit && hit.mtime === mtime) return hit.value;
  const value: unknown = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"));
  cache.set(path, { mtime, value });
  return value;
}

export function readContractsAt(dir: string): ContractsFile | null {
  return parseContractsFile(readGzJson(join(dir, "contracts.json.gz")));
}

export function readRecordAt(dir: string, id: string): ContractRecord | null {
  const all = readGzJson(join(dir, "contract-details.json.gz")) as Record<string, Omit<ContractRecord, "id">> | null;
  const record = all && Object.prototype.hasOwnProperty.call(all, id) ? all[id] : null;
  return record ? { id, ...record } : null;
}

/** One target's potential-misalignment explanation from each contract that
 *  carries one, for the tenders listed under it. */
export interface MisalignedReading {
  contract: string;
  text: string;
  confidence: string;
  mechanism: string | null;
}

export function readMisalignedAt(dir: string, target: string): MisalignedReading[] {
  const all = readGzJson(join(dir, "contract-details.json.gz")) as Record<string, Partial<Omit<ContractRecord, "id">>> | null;
  const out: MisalignedReading[] = [];
  for (const [contract, record] of Object.entries(all ?? {})) {
    for (const m of record.misaligned ?? []) {
      if (m.target === target) out.push({ contract, text: m.text, confidence: m.confidence, mechanism: m.mechanism ?? null });
    }
  }
  return out;
}

function outputDirOf(countryId: string): string | null {
  const d = derivePaths(null, countryId);
  return d.kind === "country" ? d.paths.outputDir : null;
}

export function loadContracts(countryId: string): ContractsFile | null {
  const dir = outputDirOf(countryId);
  return dir ? readContractsAt(dir) : null;
}

export function loadContractRecord(countryId: string, id: string): ContractRecord | null {
  const dir = outputDirOf(countryId);
  return dir ? readRecordAt(dir, id) : null;
}

export function loadMisalignedFor(countryId: string, target: string): MisalignedReading[] | null {
  const dir = outputDirOf(countryId);
  return dir ? readMisalignedAt(dir, target) : null;
}
