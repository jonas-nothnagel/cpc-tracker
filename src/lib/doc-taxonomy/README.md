# Document classification and hierarchy (removable system)

Gives every policy document two display-only attributes — what kind of instrument
it is (`docClass`) and where it sits in the national hierarchy (`docTier`) — so
legends, filters, matrix axes and wheel arcs group and order documents
consistently instead of presenting a national commitment framework and a single
watershed's territorial plan as peers.

Added in response to the Panama focal-group report (23 Jul 2026), "Conceptual
clarity": *"presenting documents of different types or hierarchies without clear
differentiation can lead to incorrect interpretations of their relationships."*

**This system is built to be deleted.** Everything lives in this directory, plus
optional fields on the country configs. Every touch point outside is a single
grep-able line.

## Provenance

`DOC_CLASSES` is a **project-defined vocabulary** — a normalisation of the
free-text `docKind` strings countries already declare. Each document's assignment
to a class and tier must trace to that document's own self-description, recorded
in `_docClassComment` in the country config. Never infer a tier from a document's
subject matter, and never LLM-draft an assignment (CLAUDE.md, "No LLM-drafted
content in pipeline inputs").

Display labels live in the message catalog under `docTaxonomy.class.*` and
`docTaxonomy.tier.*`, never in this code, so en/es/mn stay in lockstep.

## Turning it off without deleting code

Remove the `docClass` and `docTier` keys from the country configs
(`python/data/*-country-config.json`). Every accessor here returns `undefined`,
`hasDocTaxonomy()` returns false, and each call site falls back to the flat
rendering it had before this system existed. This is a complete functional
rollback with no code change.

## Removal recipe

1. Delete the root:

   ```bash
   git rm -r src/lib/doc-taxonomy
   ```

2. Find and delete the one-line touch points (each is an import plus a single
   call or chip):

   ```bash
   grep -rn "doc-taxonomy" src/
   ```

3. Drop the optional `docClass` / `docTier` fields from `DocumentTypeEntry` in
   `src/types/index.ts` and from the country configs, and delete the
   `labels.docClass` / `labels.docTier` / `labels.docTierHint` keys from
   `messages/{en,es,mn}.json`.

`src/lib/utils.ts` is deliberately untouched: `getDocTypeOrder` still returns the
plain config index it always did, and the tier ordering is a separate opt-in key
(`docTierSortKey`) that call sites choose. Nothing in shared code changed, so
there is nothing there to revert.

After step 1 alone the build fails only at the grep-able touch points, which is
the point: nothing depends on this system implicitly.
