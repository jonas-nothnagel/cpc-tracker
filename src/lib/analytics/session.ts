/**
 * Per-tab analytics session id: sessionStorage-backed UUID rotated after
 * 30 minutes of inactivity. sessionStorage gives per-tab, cleared-on-close
 * scoping for free; the idle rotation handles long-parked tabs. Client-only;
 * same defensive storage handling as src/lib/feedback/client-id.ts.
 */

const SESSION_KEY = "cpc-analytics-session";
export const SESSION_IDLE_MS = 30 * 60_000;

let memorySession: { id: string; last: number } | null = null;

export function getSessionId(now: number = Date.now()): string {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    let session: { id: string; last: number } | null = null;
    if (stored) {
      const parsed = JSON.parse(stored) as { id?: unknown; last?: unknown };
      if (typeof parsed.id === "string" && typeof parsed.last === "number") {
        session = { id: parsed.id, last: parsed.last };
      }
    }
    if (!session || now - session.last > SESSION_IDLE_MS) {
      session = { id: crypto.randomUUID(), last: now };
    }
    session.last = now;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session.id;
  } catch {
    if (!memorySession || now - memorySession.last > SESSION_IDLE_MS) {
      memorySession = { id: crypto.randomUUID(), last: now };
    }
    memorySession.last = now;
    return memorySession.id;
  }
}
