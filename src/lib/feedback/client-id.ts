/**
 * Per-browser pseudonymous id shared by every feedback surface.
 *
 * Uses the SAME localStorage key as the vote control
 * (coherence-briefing/feedback-control.tsx), so votes and extraction-review
 * corrections from one browser correlate in analysis. Client-only.
 */

const CLIENT_ID_KEY = "cpc-feedback-client-id";

let memoryClientId: string | null = null;

export function getFeedbackClientId(): string {
  try {
    const stored = localStorage.getItem(CLIENT_ID_KEY);
    if (stored) return stored;
    const fresh = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, fresh);
    return fresh;
  } catch {
    if (!memoryClientId) memoryClientId = crypto.randomUUID();
    return memoryClientId;
  }
}
