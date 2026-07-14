# First-party usage analytics (removable system)

Self-hosted, anonymous usage telemetry: page views, auto-captured clicks,
and named interactions, appended as JSONL to the same persistent ledger
directory as the feedback/footprint ledgers
(`${CPC_LEDGER_DIR:-python/output}/analytics/events-YYYY-MM.jsonl`), with an
internal dashboard at `/analytics`.

**This system is deliberately built to be deleted.** It may not ship in the
public DPG release. Everything lives in four roots, and every touch point
outside them is a single grep-able line. Keep it that way: never import
analytics modules from shared code, and keep every new `track()` call site a
one-line, deletable statement.

## Privacy posture

- No IPs, no raw user agents (coarse `chrome/linux`-style families only), no
  raw URLs (whitelisted route patterns only), no input values (elements
  containing form controls never contribute label text).
- Visitor id is the same pseudonymous per-browser UUID as the feedback
  ledgers; session id is per-tab, rotated after 30 min idle.
- The server rebuilds every stored row field-by-field from a whitelist
  (`validate.ts`), so unlisted fields cannot be persisted.
- Do-Not-Track and Global Privacy Control are honored; `NEXT_PUBLIC_ANALYTICS_DISABLED=1`
  disables collection per deployment.
- The dashboard requires `ANALYTICS_DASHBOARD_TOKEN` (unset ⇒ 404) and only
  ever receives identifier-free aggregates.
- **Exception — chat questions are stored verbatim** (added July 2026 by
  explicit decision): the coherence-chat route appends each question to
  `analytics/chat-queries-YYYY-MM.jsonl` (`chat-queries.ts`). Mitigations:
  stored WITHOUT any visitor/session id so questions cannot be linked into
  a per-person profile; a disclosure line under the chat input
  (`explorer.chat.storageNotice`, en/es/mn); DNT and
  `NEXT_PUBLIC_ANALYTICS_DISABLED=1` also suppress capture server-side.

## Turning it off without code changes

- Collection: set `NEXT_PUBLIC_ANALYTICS_DISABLED=1` (build-time env).
- Dashboard: leave `ANALYTICS_DASHBOARD_TOKEN` unset (the default).

## Removal recipe

1. Delete the four roots:

   ```bash
   git rm -r src/lib/analytics src/components/analytics \
     src/app/analytics src/app/api/analytics
   ```

2. Find and delete the one-line touch points (each is an import plus a
   single mount/call line):

   ```bash
   grep -rn "lib/analytics\|components/analytics" src/
   ```

   Expected hits: the `<AnalyticsProvider />` mount in
   `src/app/[locale]/layout.tsx` (also drop the then-unused
   `import { Suspense } from "react"` there), the `track(...)` call sites
   in dashboard/upload/chat components (revert `onChange`/`onStepChange`
   wrappers to their plain callbacks), the `section_viewed` import +
   effect in `src/components/dashboard/coherence-briefing/index.tsx`, the
   `appendChatQuery` import + call in
   `src/app/api/coherence-chat/route.ts`, and the disclosure `<p>` block in
   `policy-coherence-explorer.tsx` (also delete the
   `explorer.chat.storageNotice` key from `messages/{en,es,mn}.json`).

   Rehearsed 2026-07-13 (v1 scope): after these steps `pnpm build`,
   `pnpm test`, and `pnpm lint` were all green.

3. Optional (inert if left): remove `ANALYTICS_DASHBOARD_TOKEN` and
   `NEXT_PUBLIC_ANALYTICS_DISABLED` from `.env.example`, the
   `python/output/analytics` lines from `.gitignore` / `.dockerignore`, the
   `analytics` token from the skip-case in `start.sh`, and the `analytics`
   token from the matcher regex in `src/proxy.ts`.

   Also inert if left: the `data-track="..."` attributes on wheel/matrix/
   explorer elements and the `data-section-id={activeSection}` attributes on
   the centerpiece containers — plain data attributes that nothing reads
   once the provider is gone. Delete them only if you want a spotless tree
   (grep `data-track=` and `data-section-id={activeSection}`).

4. Verify: `pnpm build && pnpm test` — both green. Collected data (if any)
   remains on the persistent volume under `analytics/`; delete that
   directory via Kudu to purge it.
