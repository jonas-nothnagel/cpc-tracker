# Getting to the targets, and to their source (removable system)

Two related problems, reported by users: the targets were too hard to reach in
totality, and it was too hard to get from a target to the original document.

**Reaching them.** A good per-document browser already existed
(`DocTargetsDrawer` — search, filter chips, batched reveal for the 206-target
REDD+ strategy). Every route into it was a hover or an expand: the wheel
legend's hover card, the collapsed inspect-and-adjust panel, the Doc-in-Focus
title popover. Nothing on the page said the word "targets" until you had already
gone looking. `TargetsBrowseBar` is a visible, always-on row of documents and
counts, above the fold, and every chip opens that same drawer.

**Getting to the source.** The drawer already showed a labelled verbatim quote
and a section line. What was broken was the link beside them: it rendered
`sources[0].url` raw, and for **213 of Panama's 368 targets** that is a
`undp.sharepoint.com` location. A Panamanian planner clicking "Open the source"
got a sign-in wall for a tenant they have no account in — which reads as the tool
having no link at all. `publicSourceUrl` resolves to something openable.

## What the data supports, and what it does not

| | Coverage |
|---|---|
| Verbatim source quote | **100%** — every target, all three countries |
| Page numbers | **none** — `pages` is empty on every span, everywhere |
| Section | Mongolia 41/178, Sri Lanka 9/404, Panama 0/368 |
| Usable span URL | Mongolia 87 (all public), Panama 36 of 249, Sri Lanka 0 |
| Country-config document URL | Panama 7/9, Mongolia 8/11, Sri Lanka 2/8 |

**Nothing here may claim a page.** The quote is the locator. If page location is
added later (`extract_validation.py` already has a four-level quote matcher and
PyMuPDF is a dependency), it needs the public PDFs downloaded first.

## `publicSourceUrl`

Order: the target's own span URL when its host is publicly reachable, then the
country config's document URL, then `null`.

`PRIVATE_URL_HOSTS` is a **denylist**, not an allowlist of public hosts. New
countries arrive with new legitimate government domains (`legalinfo.mn`,
`mef.gob.pa`, `pancanal.com`) and an allowlist would silently swallow them —
the opposite of the failure worth guarding against.

Returning `null` is a real outcome, not a bug. Sri Lanka has a public URL for 2
of 8 documents; a row with no link is honest where a dead one is not.

## Turning it off without deleting code

`TARGETS_BROWSE_BAR = false` in `config.ts` hides the bar. The three original
routes into the drawer still work — the page just goes back to being harder to
find your way around, which is the state that prompted this.

## Removal recipe

1. Delete the root:

   ```bash
   git rm -r src/components/dashboard/coherence-briefing/targets-access
   ```

2. Find and delete the touch points (a mount in `index.tsx`, the link swap and
   header card in `doc-targets-drawer.tsx`):

   ```bash
   grep -rn "targets-access\|TargetsBrowseBar\|TargetProvenance\|publicSourceUrl" src/
   ```

3. Restore the drawer's original link, which was:

   ```tsx
   {source?.url && (
     <a href={source.url} target="_blank" rel="noopener noreferrer">{t("openSource")} ↗</a>
   )}
   ```

   Note that this reinstates the SharePoint problem for Panama.

4. Drop `browsableDocs` / `browsableCountByDoc` / `browsableTargets` from
   `index.tsx` (restoring `allTargets={targets}`), and the
   `briefing.browseTargets` / `briefing.provenance` message blocks.
