End-to-end delivery: ship a PR, self-review, apply the non-blocking fixes, merge, sync to the Vercel backup, then deploy the merged commit to the live Azure site.

This is the combined form of `/ship` + `/review-pr` + (merge) + `/sync` + deploy. Use when the current working tree holds a focused change that is ready to go all the way to production in one pass.

If `$ARGUMENTS` is provided, treat it as the branch name hint (e.g. `fix/lint-break` or `feat/footprint-tracker`). Otherwise derive a branch name from the change.

## Steps

### 1. Ship

**First, if the change will be deployed, ask the user to run `! az login`** (the token expires weekly), so it is done while the PR is reviewed rather than blocking at the end. Do not ask for the PIM role elevation yet: that waits until the PR is merged (step 6.1), so elevated rights are held only for the deploy.

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

**6.1 Before building.** Stop and ask the user if any of these fails; never work around them.

1. `az` works: `az acr show --name policycoherence --query loginServer -o tsv`. `az account show` can look fine while real calls fail with `AADSTS70043`; if so, ask the user to run `! az login`.
2. **Ask the user to activate PIM Contributor now** (default 2h): `https://portal.azure.com/#view/Microsoft_Azure_PIMCommon/ActivationMenuBlade/~/azurerbac`. ACR push needs it; the standing role is Reader. Asking only now keeps the elevation to the deploy itself. Never try to elevate the role yourself.
3. The block below checks the rest: that the PR is merged, that deploying cannot roll the live site back, and that the merge commit passes `tsc` and the tests.

**6.2 Build the exact merge commit.** Run this block as ONE command, changing only the PR number on the first line:

```bash
PR=<number> bash -euo pipefail <<'DEPLOY'
: "${PR:?set PR to the pull request number}"
git fetch origin --quiet
MERGE_SHA=$(gh pr view "$PR" --json mergeCommit --jq '.mergeCommit.oid // empty')
[ -n "$MERGE_SHA" ] || { echo "PR $PR is not merged; nothing to deploy" >&2; exit 1; }

# Never roll the live site back: what is live must already be in this commit's history.
LIVE_TAG=$(az acr manifest list-metadata -r policycoherence -n cpc-tracker \
  --query "[?tags[?@=='latest']].tags[?@!='latest' && @!='buildcache']|[0]|[0]" -o tsv)
if [ -n "$LIVE_TAG" ]; then
  LIVE_SHA=$(git rev-parse --verify --quiet "$LIVE_TAG^{commit}") \
    || { echo "live commit $LIVE_TAG is not in local history; git fetch, then retry" >&2; exit 2; }
  [ "$LIVE_SHA" != "$MERGE_SHA" ] || { echo "$MERGE_SHA is already live"; exit 0; }
  git merge-base --is-ancestor "$LIVE_SHA" "$MERGE_SHA" \
    || { echo "live $LIVE_TAG is newer than or unrelated to $MERGE_SHA; deploying would roll it back" >&2; exit 2; }
fi

# Clean checkout of exactly the merge commit (clear any leftover from an interrupted run).
ROOT="$(git rev-parse --show-toplevel)"
DEPLOY_WT="$ROOT/.claude/worktrees/deploy-${MERGE_SHA:0:7}"
git worktree remove --force "$DEPLOY_WT" 2>/dev/null || true
git worktree prune
git worktree add --quiet --detach "$DEPLOY_WT" "$MERGE_SHA"
trap 'cd "$ROOT"; git worktree remove --force "$DEPLOY_WT" || true' EXIT
cd "$DEPLOY_WT"
[ "$(git rev-parse HEAD)" = "$MERGE_SHA" ]

# The commit that ships must be green. Exit 3 means red: ask the user.
if [ "${ALLOW_RED:-0}" != 1 ]; then
  pnpm install --offline --frozen-lockfile --silent
  { npx tsc --noEmit && pnpm test --run --silent; } \
    || { echo "merge commit $MERGE_SHA is not green; ask the user (ALLOW_RED=1 deploys anyway)" >&2; exit 3; }
fi

az acr build --registry policycoherence --image "cpc-tracker:$MERGE_SHA" --image cpc-tracker:latest .
echo "pushed $MERGE_SHA as cpc-tracker:latest"
DEPLOY
```

What each part guards against:
- **One command, `set -u`.** The agent's shell does not keep variables between calls; split up, an empty path makes `cd ""` succeed and `az acr build .` upload the main working tree.
- **The merge SHA and the ancestor check.** PRs merge in parallel here. Building the tip of `main` can ship someone else's unreviewed merge, and a slower deploy of an older PR finishing last would roll the site back.
- **A clean checkout.** `az acr build .` uploads the directory as it sits on disk, filtered only by `.dockerignore`; the main tree carries uncommitted edits and the gitignored ingest scripts in `dev_data_scripts/`.
- **The green check.** `main` can be red from other merges, and deploying ships all of it; that is the user's decision, not this command's. `ALLOW_RED=1` exists for when they have made it.
- **Tags.** The full SHA plus `latest`, nothing else: `scripts/deploy.sh` reads the live commit as the first non-`latest` tag, so a short SHA would sort first and break it.
- **Cleanup.** A run killed mid-build leaves the worktree behind, so the next run clears it first; the trap ends in `|| true` so a failed cleanup cannot turn a successful push into a failure that invites a second push.
- The build takes several minutes: give the command a long timeout or run it in the background.

**Never use `pnpm run deploy` / `scripts/deploy.sh` on an Apple Silicon Mac.** Its local build is arm64 with attestation manifests; App Service can pull neither and the site drops to a persistent 503 (seen 2026-07-07). The script now refuses to run on arm64.

**6.3 Confirm it went live.** The site keeps answering 200 from the old container during the ~1-2 min swap, so a 200 alone proves nothing.
1. The ACR webhook told App Service to pull: `az acr webhook list-events --registry policycoherence --name webappcpctrackerc657 -o table`. The newest event is this push, with status 200 or 202.
2. If the change is visible over HTTP, check it is served, for example a changed count from `https://cpc-tracker-c657.azurewebsites.net/api/dashboard?country=<id>` or a new page.
3. If the webhook event is missing or failed, or the change is still not served after ~5 min, force the pull: `az webapp restart --name cpc-tracker-c657 --resource-group undphqbppsai001`. The webhook has failed silently before (see the `reference_azure_deploy_webhook_fix` memory).
4. A change with nothing visible over HTTP (docs, pipeline code) is confirmed by the webhook event alone; say so in the report rather than claiming it is served.

### 7. Report

Print a concise summary:
- PR URL and number
- Commit hashes (original + review fixes)
- Merge commit hash
- Confirmation that `old-origin/main` was updated
- Deploy status: the image tag (full SHA), the webhook event, and whether the change was seen served, or why it cannot be seen over HTTP

## Important

- **Never force push** or amend published commits.
- **Never commit `.env` files or credentials.** Warn the user if they ask to.
- **Never skip the `old-origin` push** — it is what drives the Vercel demo deploy (see `reference_vercel_deploy` memory).
- **Never deploy from the main working tree.** Build from a clean checkout of the merge commit (step 6.2); the main tree carries uncommitted and gitignored files that `az acr build` would ship.
- **Never use `pnpm run deploy` on Apple Silicon.** It ships an image App Service cannot pull and takes the site down; the script now refuses (step 6.2).
- **Never skip the Azure deploy step** — Azure is the primary live site and does not auto-deploy on merge; without step 6 the change is merged but not live. See `reference_manual_azure_deploy` memory.
- **The PIM Contributor activation is interactive and just-in-time** — it needs the user's portal + MFA and cannot be automated. Pause and wait; do not attempt to elevate the role or work around it.
- **This deploy step is a stopgap.** When GitHub Actions auto-deploy is restored for the account, remove step 6 and merges will go live automatically again.
- **Never add AI attribution** to commits, PR body, review comments, or follow-up comments.
- **Stop before merge** if the review finds anything that could be a bug, a regression, or a security issue. Non-blocking nits (dead code, typo in comment, naming) can be auto-applied; judgement calls require user confirmation.
- **Match recent commit style.** Before writing the commit message, glance at `git log --oneline -10` to mirror title phrasing conventions.
- **If the branch already exists on origin**, ask before overwriting. Do not force push to recover.
- **If `pnpm lint` / `tsc` / `test` fail at step 1.2**, do not try to delivery around the failure. Stop and report.
