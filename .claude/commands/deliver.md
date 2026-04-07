End-to-end delivery: ship a PR, self-review, apply the non-blocking fixes, merge, then sync to the Vercel remote.

This is the combined form of `/ship` + `/review-pr` + (merge) + `/sync`. Use when the current working tree holds a focused change that is ready to go all the way to production in one pass.

If `$ARGUMENTS` is provided, treat it as the branch name hint (e.g. `fix/lint-break` or `feat/footprint-tracker`). Otherwise derive a branch name from the change.

## Steps

### 1. Ship

Follow the `/ship` workflow:

1. `git status` and `git diff --stat` to confirm what is being delivered.
2. Verify the working tree is sane: `pnpm lint`, `npx tsc --noEmit`, `pnpm test --run` all exit 0. If any fail, stop and surface the failures — do NOT proceed.
3. `git checkout -b <branch>` from the current branch. Pick a descriptive `fix/...` or `feat/...` name.
4. Stage changed files explicitly (never `git add -A`). Skip anything that looks like a secret (`.env`, `credentials.json`, etc.) and warn if the user staged one.
5. Commit with a concise "why"-focused message. No em dashes (user preference). No `Co-Authored-By: Claude` / `Generated with Claude Code` attribution.
6. `git push -u origin <branch>`.
7. Create the PR with `gh pr create`:
   - Title under 70 chars.
   - Body with `## Summary`, `## Changes`, `## Test plan` sections (use a HEREDOC).
   - No AI attribution.
8. Capture the PR number — you need it for the remaining steps.

### 2. Self-review

Follow the `/review-pr` workflow against the PR you just created:

1. `gh pr view <pr> --json number,title,body,headRefName,baseRefName,files`
2. `gh pr diff <pr>` and read the key changed files.
3. Analyse for correctness, security, quality, completeness, missing tests/docs. Look specifically for things the author (you) might have missed: edge cases in refactors, latent regressions, dead code left behind, type shortcuts, initial-state assumptions.
4. Post the review as a comment with `gh pr review <pr> --comment --body "<review>"` (HEREDOC for formatting). Structure: **Overview**, **What looks good**, **Suggestions** (with `file:line` refs), **Questions**, **Verdict**.

### 3. Decide and iterate

- **Blocking issues found** → STOP. Surface them to the user with a clear ask ("these look blocking — fix and push, or merge as-is?"). Do not proceed to merge.
- **Only non-blocking suggestions** → apply them on the same branch:
  1. Make the edits.
  2. Re-run `pnpm lint`, `npx tsc --noEmit`, `pnpm test --run` — all must stay green.
  3. Commit the fixes with a short message like `Address review comments`.
  4. `git push`.
  5. Post a follow-up comment on the PR confirming which suggestions were addressed and which commit they landed in. Use `gh pr comment <pr> --body "..."`.
- **Clean review** → skip to step 4.

Note: `gh pr review --approve` will fail with `Can not approve your own pull request`. That is expected. A confirmation comment via `gh pr comment` is the substitute.

### 4. Merge

Use the merge style consistent with this repo's recent history (check `git log --oneline -20` if unsure — this project uses merge commits):

```
gh pr merge <pr> --merge --delete-branch
```

The `--delete-branch` flag removes the feature branch on origin. `gh pr merge` also updates the local main automatically.

### 5. Sync to Vercel (old-origin)

Follow the `/sync` workflow:

1. Confirm you are on `main` and the working tree is clean.
2. `git pull origin main` — should report "Already up to date" because `gh pr merge` already synced.
3. `git push old-origin main` — this is the critical step. `old-origin` points at `jonas-nothnagel/cpc-tracker.git`, which Vercel watches for the demo deploy. Skipping this means the merge never reaches the public demo.

### 6. Report

Print a concise summary:
- PR URL and number
- Commit hashes (original + review fixes)
- Merge commit hash
- Confirmation that `old-origin/main` was updated

## Important

- **Never force push** or amend published commits.
- **Never commit `.env` files or credentials.** Warn the user if they ask to.
- **Never skip the `old-origin` push** — it is what drives the Vercel demo deploy (see `reference_vercel_deploy` memory).
- **Never add AI attribution** to commits, PR body, review comments, or follow-up comments.
- **Stop before merge** if the review finds anything that could be a bug, a regression, or a security issue. Non-blocking nits (dead code, typo in comment, naming) can be auto-applied; judgement calls require user confirmation.
- **Match recent commit style.** Before writing the commit message, glance at `git log --oneline -10` to mirror title phrasing conventions.
- **If the branch already exists on origin**, ask before overwriting. Do not force push to recover.
- **If `pnpm lint` / `tsc` / `test` fail at step 1.2**, do not try to delivery around the failure. Stop and report.
