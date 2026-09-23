End-to-end delivery: ship a PR, self-review, apply the non-blocking fixes, merge, sync to the Vercel backup, then deploy the merged commit to the live Azure site.

This is the combined form of `/ship` + `/review-pr` + (merge) + `/sync` + deploy. Use when the current working tree holds a focused change that is ready to go all the way to production in one pass.

If `$ARGUMENTS` is provided, treat it as the branch name hint (e.g. `fix/lint-break` or `feat/footprint-tracker`). Otherwise derive a branch name from the change.

## Steps

### 1. Ship

**First, ask the user for the two interactive Azure steps the deploy (step 6) needs**, so they can do them while the PR is reviewed rather than blocking at the end: `! az login` (the token expires weekly), and activating PIM Contributor (lasts 2h). Details in step 6.1.

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

### 6. Deploy to live (Azure)

Azure App Service `cpc-tracker-c657` is the **primary live site** and does not auto-deploy on merge (GitHub Actions was deactivated for this account 2026-06-23), so the merged commit must be built and pushed explicitly. This is the step that makes the change actually go live.

1. **Sign-in and role (interactive; ask the user, never work around them).** These should already have been requested at the start of step 1.
   - The `az` token expires weekly under conditional access. `az account show` can look fine while real calls fail with `AADSTS70043`, so test with a real call: `az acr show --name policycoherence --query loginServer -o tsv`. If it fails, ask the user to run `! az login`.
   - ACR push needs Contributor; the standing role is Reader. Ask the user to activate **PIM Contributor** (default 2h): `https://portal.azure.com/#view/Microsoft_Azure_PIMCommon/ActivationMenuBlade/~/azurerbac`. Do not try to elevate the role yourself.
   - Check, read-only, that the analytics token app setting exists: `az webapp config appsettings list --name cpc-tracker-c657 --resource-group undphqbppsai001 --query "length([?name=='ANALYTICS_DASHBOARD_TOKEN'])" -o tsv` should print `1`. If it prints `0`, `/analytics` will 404: tell the user, and do not generate or overwrite a token yourself (`scripts/deploy.sh` documents how).
2. **Build the exact merge commit, from a clean checkout, in ONE shell invocation.** Replace `<number>` with the PR number and run this whole block as a single command:
   ```bash
   bash -euo pipefail <<'DEPLOY'
   PR=<number>
   git fetch origin --quiet
   MERGE_SHA=$(gh pr view "$PR" --json mergeCommit --jq '.mergeCommit.oid // empty')
   [ -n "$MERGE_SHA" ] || { echo "PR $PR is not merged; nothing to deploy" >&2; exit 1; }
   ROOT="$(git rev-parse --show-toplevel)"
   DEPLOY_WT="$ROOT/.claude/worktrees/deploy-${MERGE_SHA:0:7}"
   git worktree add --detach "$DEPLOY_WT" "$MERGE_SHA"
   trap 'cd "$ROOT" && git worktree remove --force "$DEPLOY_WT"' EXIT
   cd "$DEPLOY_WT"
   [ "$(git rev-parse HEAD)" = "$MERGE_SHA" ]
   az acr build --registry policycoherence \
     --image "cpc-tracker:$MERGE_SHA" --image "cpc-tracker:${MERGE_SHA:0:7}" --image cpc-tracker:latest .
   DEPLOY
   ```
   Why each piece matters:
   - **One invocation, `set -u`:** the agent's shell does not keep variables between calls. Split across calls, an empty `$DEPLOY_WT` makes `cd ""` succeed silently and `az acr build .` upload the main working tree.
   - **The merge SHA, not `origin/main`:** PRs merge in parallel here, so the tip of `main` may already include someone else's unreviewed change by the time this runs.
   - **A clean checkout:** `az acr build .` uploads the directory as it sits on disk, filtered only by `.dockerignore`. The main tree carries uncommitted edits and the gitignored ingest scripts in `dev_data_scripts/`, which would ship to production.
   - **Tags:** the full SHA matches what `scripts/deploy.sh` compares against; the short SHA is for people.
   - It takes several minutes; give the command a long timeout or run it in the background.
3. **Do not use `pnpm run deploy` / `scripts/deploy.sh` on an Apple Silicon Mac.** It builds a native arm64 image and its registry cache export attaches attestation manifests; App Service can pull neither, so the site drops to a persistent 503 (`ImagePullFailure`, seen 2026-07-07). It is only safe from an amd64 machine.
4. The ACR webhook (`webappcpctrackerc657`) fires on push, so App Service pulls the new image automatically. The container swap finishes ~1-2 min later, and the site keeps answering 200 from the old container in the meantime. If it looks stuck after ~5 min, force the pull: `az webapp restart --name cpc-tracker-c657 --resource-group undphqbppsai001`.
5. **Confirm the new build is live, not just that the site answers.** A bare 200 can come from the old container. Check `curl -sS -o /dev/null -w "%{http_code}" https://cpc-tracker-c657.azurewebsites.net/` returns 200 **and** something only this change contains is served, for example a changed count from `https://cpc-tracker-c657.azurewebsites.net/api/dashboard?country=<id>` or a new page. Poll for a few minutes before forcing the restart.

### 7. Report

Print a concise summary:
- PR URL and number
- Commit hashes (original + review fixes)
- Merge commit hash
- Confirmation that `old-origin/main` was updated
- Confirmation that the live Azure site was deployed (image tag / SHA), returns 200, and serves the change

## Important

- **Never force push** or amend published commits.
- **Never commit `.env` files or credentials.** Warn the user if they ask to.
- **Never skip the `old-origin` push** — it is what drives the Vercel demo deploy (see `reference_vercel_deploy` memory).
- **Never deploy from the main working tree.** Build from a clean worktree at the merge commit (step 6.2); the main tree carries uncommitted and gitignored files that `az acr build` would ship.
- **Never use `pnpm run deploy` on Apple Silicon.** It ships an image App Service cannot pull and takes the site down (step 6.3).
- **Never skip the Azure deploy step** — Azure is the primary live site and does not auto-deploy on merge; without step 6 the change is merged but not live. See `reference_manual_azure_deploy` memory.
- **The PIM Contributor activation is interactive** — it needs the user's portal + MFA and cannot be automated. Pause and wait; do not attempt to elevate the role or work around it.
- **This deploy step is a stopgap.** When GitHub Actions auto-deploy is restored for the account, remove step 6 and merges will go live automatically again.
- **Never add AI attribution** to commits, PR body, review comments, or follow-up comments.
- **Stop before merge** if the review finds anything that could be a bug, a regression, or a security issue. Non-blocking nits (dead code, typo in comment, naming) can be auto-applied; judgement calls require user confirmation.
- **Match recent commit style.** Before writing the commit message, glance at `git log --oneline -10` to mirror title phrasing conventions.
- **If the branch already exists on origin**, ask before overwriting. Do not force push to recover.
- **If `pnpm lint` / `tsc` / `test` fail at step 1.2**, do not try to delivery around the failure. Stop and report.
