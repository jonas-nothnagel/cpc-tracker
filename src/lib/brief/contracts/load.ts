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
