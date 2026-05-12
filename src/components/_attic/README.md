# `_attic/` — deactivated components, preserved for reference

Files here are **not imported** by any production code path. They are kept
in-tree (instead of deleted) so the team can:

- recover prior implementations if a future surface needs them,
- diff design history without spelunking through `git log`,
- review what was tried and retired before proposing similar work.

## Conventions

- The `_` prefix marks the folder as "not for routing or feature use".
- Nothing under `_attic/` should be imported from production code. If you
  find yourself wanting to import from here, copy the relevant piece back
  into `src/components/<area>/` instead.
- TypeScript still compiles these files (they remain under `src/`), so
  drift in shared types (`@/types`, `@/lib`) will surface as a build
  error here. Either fix the file or remove it.

## Current contents and why they live here

### `viz/tension-clusters.tsx`
Standalone "structural tension analysis" panel. Functionality is now
folded into the coherency wheel (`viz/policy-coherence-explorer.tsx`)
under the **Tensions** stat-view, which will be the surface for further
development. Kept for context — the driver-target ranking pattern may
inform the wheel's expanded tension view.

### `viz/alignment-heatmap.tsx`, `viz/coherency-chord.tsx`, `viz/contradiction-summary.tsx`, `viz/stat-card.tsx`
Casualties of `feat/atlas-overhaul`. Already orphaned (no consumers in
`src/`); flagged in `docs/audit/2026-04-zoom-out/integration-backlog.md`
as item I-19. Deactivated here rather than deleted in case any of the
visual primitives (e.g. the stat-card layout) get revived.

Note: `coherency-chord.tsx` is the legacy chord renderer, not the live
coherency wheel. The wheel lives in `viz/policy-coherence-explorer.tsx`.

### `upload/document-upload-zone.tsx`, `upload/targets-by-document.tsx`
Upload wizard primitives left behind by the wizard rewrite. No consumers
in `src/`. Kept in case the new wizard needs to mirror their structure.
