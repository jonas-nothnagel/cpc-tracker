# Glossary and reading lines (removable system)

Two related pieces of always-visible explanation:

- **`GlossaryTerm`** — an inline term that reveals a plain-language definition
  on hover, focus, or tap.
- **`ReadingLine`** — one persistent line under a section headline saying how to
  read the visual, distinct from the finding itself.

Added in response to the Panama focal-group report (23 Jul 2026): "full
understanding of the graphs" scored 5/11, "relationships easy to interpret"
5/11, and 8 of 11 named contextual tooltips as the help they wanted. Guided
tours had shipped a week before that session and comprehension was still 5/11,
so the answer is explanation that is *already on screen*, not more explanation
behind a click.

**This system is built to be deleted.** Everything lives in this directory plus
`src/data/glossary.ts` and the `glossary.*` / `*.reading` message keys.

## Scope

`GlossaryTerm` is definition-only. The briefing's own `AlignmentTermPopover`
(`sections/direction.tsx`) stays where it is: it pairs a definition with a real
example pair and a click-through, and is coupled to fault-line data this
component deliberately knows nothing about. Deleting the glossary therefore
cannot regress the one section that already had a term popover.

## Writing definitions

They are user-facing policy copy. Plain language, no pipeline vocabulary, and
state the limit where testing showed it was misread ("a prompt for review, not a
finding"). Respect the negative-side rules in CLAUDE.md and the briefing
HANDOFF: "potential misalignment", never "contradiction" or "tension"; never
"low" as a standalone positive.

Strings live only in `messages/{en,es,mn}.json` under `glossary.<id>`, so the
i18n parity gate covers them.

## Turning it off without deleting code

Set `GLOSSARY_ENABLED = false` in `config.ts`. Every `GlossaryTerm` renders as
the plain text it annotates and every `ReadingLine` renders nothing, leaving
each surface exactly as it read before. No other file changes.

## Removal recipe

1. Delete the roots:

   ```bash
   git rm -r src/components/ui/glossary src/data/glossary.ts
   ```

2. Find and delete the one-line touch points (each is an import plus a single
   `reading={...}` prop):

   ```bash
   grep -rn "ui/glossary\|data/glossary" src/
   ```

3. Drop the optional `reading` prop from `SlideFrame`
   (`src/components/dashboard/coherence-briefing/slide-frame.tsx`).

4. Delete the `glossary.*` block and every `*.reading` key from
   `messages/{en,es,mn}.json`.
