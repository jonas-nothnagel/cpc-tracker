import { join } from "path";

/**
 * Resolve the shared footprint ledger file path.
 *
 * MUST mirror the Python resolver (python/src/footprint/ledger.py
 * `ledger_path()`) so the pipeline and the chat route write to the same file.
 * Honours CPC_LEDGER_DIR (set explicitly on Azure to the persistent mount);
 * falls back to the repo-relative python/output directory when run locally.
 * Server-only (uses process.cwd()).
 */
export function ledgerPath(): string {
  const root = process.env.CPC_LEDGER_DIR;
  const base =
    root && root.length > 0 ? root : join(process.cwd(), "python", "output");
  return join(base, "footprint-ledger.jsonl");
}
