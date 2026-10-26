/**
 * Runs once when the server starts. On the hosted service a restart or a
 * deploy ends the analysis in progress: its heartbeat stops, so it goes back
 * in line once and resumes from its cache, and the line moves on. The line
 * is looked at again every 30 seconds, whether or not anyone is watching. Old drafts
 * nobody started go. Skipped in development, where the dev server restarts
 * often; there, a waiting page's next look does the same.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  try {
    const { bootQueue, watchQueue } = await import("@/lib/upload/queue");
    bootQueue();
    watchQueue();
  } catch (err) {
    console.warn("Upload queue could not start:", err instanceof Error ? err.message : err);
  }
}
