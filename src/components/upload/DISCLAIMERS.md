# What the upload pages deliberately do not say on screen

The upload page and the waiting page follow the brief's rule of no fine print
on visuals (see `CLAUDE.md`, "Self-explanatory visuals"). These are the
caveats a reader might expect beside the content, and where each is said
instead. Keep this file in step with the pages.

| Caveat | Not on screen because | Where it is said |
| --- | --- | --- |
| A target's English working text may be machine-translated from the document's language. | A tag on every row is clutter; the original wording is shown under each translated target, in its language. | Each target row shows `textOriginal` with its `lang`; the brief's own translation note (`brief.sheet.translatedMachine`) speaks for the finished analysis. |
| Targets are read from the documents by an AI model and can be wrong or incomplete. | The step exists to check them; each target links to the passage it was read from. | The notice before reading names the model and provider; the passage under "page {n}"; How it works (`/methodology`). |
| The time and footprint on the start step are estimates. | "About" already says so. | `docs/ACCESS_AND_LIMITS.md`, "Where documents go, and what is kept", gives the basis (this service's recent runs and footprint ledger). |
| Pairs are compared by an AI model; ratings are review prompts, not findings. | The waiting page shows counts only; the brief labels its AI-derived content. | The brief (AI labels and tooltips), How it works. |
| Only public documents may go to UNDP's hosted service. | Said, once, as the last sentence of the notice before reading (`CPC_PUBLIC_DOCUMENTS_ONLY`). | The notice itself; `docs/ACCESS_AND_LIMITS.md`. |
