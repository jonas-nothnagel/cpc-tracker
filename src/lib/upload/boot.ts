import { randomUUID } from "crypto";

/**
 * Facts about this server process that uploads depend on. Server-only.
 */

/** Hosts without Python (Vercel, Lambda) cannot read documents or run
 *  analyses. */
export const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

/** This server process, as the jobs it starts record it (CPC_BOOT_ID): a
 *  job with another boot id was started by a server that is gone, so its
 *  process id says nothing here. */
export const BOOT_ID = randomUUID();

/** A job whose status file has not been rewritten for this long, and whose
 *  process cannot be seen alive, is gone. Its heartbeat comes every 15 s. */
export const STALE_MS = 120_000;

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but belongs to someone else.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** True when a job last heard from at `heartbeatAt` (by a server with
 *  `bootId`, as process `pid`) is gone. */
export function jobGone(
  job: { heartbeatAt?: string; bootId?: string; pid?: number } | null,
  since: string | undefined,
  now: Date,
): boolean {
  const heard = Date.parse(job?.heartbeatAt ?? since ?? "");
  if (!Number.isFinite(heard) || now.getTime() - heard <= STALE_MS) return false;
  if (job?.bootId === BOOT_ID && typeof job.pid === "number" && processAlive(job.pid)) return false;
  return true;
}
