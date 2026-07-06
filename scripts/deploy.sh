#!/usr/bin/env bash
# Build the production Docker image, push to Azure Container Registry, and wait
# for App Service to redeploy. Replaces .github/workflows/deploy.yml (GHA was
# deactivated for this account 2026-06-23). Same delivery model: ACR push →
# webhook → App Service pulls → smoke test.
#
# Usage:
#   ./scripts/deploy.sh         # interactive — prompts for confirmation
#   ./scripts/deploy.sh -y      # skip confirmation, useful in scripts
#
# Prereqs:
#   - docker (with buildx)
#   - az CLI, logged in (`az login`). No service principal / ACR admin
#     password needed — `az acr login` uses your existing AAD token.
#
# Safety nets: warns if working tree is dirty or not on main; both are
# overridable via the confirmation prompt or -y.

set -euo pipefail

REGISTRY="policycoherence.azurecr.io"
REGISTRY_NAME="policycoherence"
IMAGE="cpc-tracker"
APP_URL="https://cpc-tracker-c657.azurewebsites.net/"

# ── Parse flags ──────────────────────────────────────────────────────────
SKIP_CONFIRM=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) SKIP_CONFIRM=1 ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Run with -h for help." >&2
      exit 2
      ;;
  esac
done

# ── Pre-flight ───────────────────────────────────────────────────────────
command -v docker >/dev/null || { echo "❌ docker not found"; exit 1; }
command -v az >/dev/null || { echo "❌ az CLI not found"; exit 1; }
docker buildx version >/dev/null 2>&1 || { echo "❌ docker buildx not available"; exit 1; }

# Confirm Azure auth (cheap, surfaces a clear error before the long build).
az account show --query name -o tsv >/dev/null 2>&1 || {
  echo "❌ Not logged in to Azure. Run: az login"
  exit 1
}

# PIM Contributor check. ACR push requires AcrPush, which Contributor
# includes. The subscription's standing assignment is Reader only — push
# needs the elevated role active. This catches the common case before the
# 5-minute buildx wastes wall-clock.
SUB_ID=$(az account show --query id -o tsv)
HAS_PUSH=$(az role assignment list \
  --assignee "$(az account show --query user.name -o tsv)" \
  --scope "/subscriptions/${SUB_ID}" \
  --query "[?roleDefinitionName=='Contributor' || roleDefinitionName=='Owner' || roleDefinitionName=='AcrPush'] | length(@)" \
  -o tsv 2>/dev/null || echo "0")
if [ "${HAS_PUSH:-0}" = "0" ]; then
  echo "❌ Your active Azure role is Reader-level; ACR push needs Contributor or AcrPush."
  echo
  echo "   Activate PIM Contributor via the portal (fastest):"
  echo "     https://portal.azure.com/#view/Microsoft_Azure_PIMCommon/ActivationMenuBlade/~/azurerbac"
  echo
  echo "   Or via CLI — see scripts/deploy.sh comments for the az rest call."
  echo "   PIM activations last for the duration you choose (default 2h)."
  exit 1
fi

cd "$(git rev-parse --show-toplevel)"

GIT_SHA=$(git rev-parse --short HEAD)
GIT_SHA_FULL=$(git rev-parse HEAD)
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
GIT_DIRTY=$(git status --porcelain)

# ── What's currently deployed? ───────────────────────────────────────────
# Look up the SHA tag that shares its manifest with :latest on ACR. The
# build pushes both :sha and :latest in one operation, so the non-latest
# tag on the :latest manifest tells us which commit is live.
echo "▸ Looking up currently-deployed commit on ${REGISTRY}…"
DEPLOYED_SHA=$(az acr manifest list-metadata \
  -r "${REGISTRY_NAME}" -n "${IMAGE}" \
  --query "[?tags[?@=='latest']].tags[?@!='latest' && @!='buildcache']|[0]|[0]" \
  -o tsv 2>/dev/null || true)

# ── Summary + confirmation ───────────────────────────────────────────────
echo
echo "═════════════════════════════════════════════════════════════"
echo "  Deploy ${IMAGE} → ${REGISTRY}"
echo "═════════════════════════════════════════════════════════════"
echo "  Branch:        ${GIT_BRANCH}"
echo "  Local HEAD:    ${GIT_SHA}  ($(git log -1 --format='%s' | head -c 60))"
if [ -n "${DEPLOYED_SHA}" ]; then
  DEPLOYED_SHORT="${DEPLOYED_SHA:0:7}"
  if git cat-file -e "${DEPLOYED_SHA}" 2>/dev/null; then
    DEPLOYED_SUBJECT=$(git log -1 --format='%s' "${DEPLOYED_SHA}" | head -c 60)
    echo "  Deployed now:  ${DEPLOYED_SHORT}  (${DEPLOYED_SUBJECT})"
  else
    echo "  Deployed now:  ${DEPLOYED_SHORT}  (not in local history — git fetch?)"
  fi
else
  echo "  Deployed now:  (none — :latest tag not found on ACR)"
fi
echo "  App Service:   ${APP_URL}"
echo "─────────────────────────────────────────────────────────────"

# Show new commits that will go live, if we can resolve the range.
if [ -n "${DEPLOYED_SHA}" ] && git cat-file -e "${DEPLOYED_SHA}" 2>/dev/null; then
  if [ "${DEPLOYED_SHA}" = "${GIT_SHA_FULL}" ]; then
    echo "  ℹ️  Local HEAD matches what's deployed — this is a re-push."
  else
    NEW_COMMIT_COUNT=$(git rev-list --count "${DEPLOYED_SHA}..HEAD" 2>/dev/null || echo "?")
    if [ "${NEW_COMMIT_COUNT}" = "0" ]; then
      echo "  ℹ️  HEAD is behind or unrelated to the deployed SHA."
      echo "      Deployed: $(git log -1 --format='%h %s' "${DEPLOYED_SHA}")"
    else
      echo "  ${NEW_COMMIT_COUNT} new commit(s) since the live deploy:"
      # -n 20 (not | head -20): under `set -o pipefail`, closing head early
      # would SIGPIPE git log and abort the script via `set -e`.
      git log -n 20 --oneline --no-decorate "${DEPLOYED_SHA}..HEAD" \
        | sed 's/^/    /'
      [ "${NEW_COMMIT_COUNT}" -gt 20 ] && echo "    … and $((NEW_COMMIT_COUNT - 20)) more"
      # Compact file-change summary across the whole range.
      STATS=$(git diff --shortstat "${DEPLOYED_SHA}..HEAD" 2>/dev/null || echo "")
      [ -n "${STATS}" ] && echo "   ${STATS}"
    fi
  fi
  echo "─────────────────────────────────────────────────────────────"
fi

WARNINGS=0
if [ "${GIT_BRANCH}" != "main" ]; then
  echo "  ⚠️  Not on main (you're on '${GIT_BRANCH}')"
  WARNINGS=$((WARNINGS+1))
fi
if [ -n "${GIT_DIRTY}" ]; then
  echo "  ⚠️  Working tree has uncommitted changes — docker build copies"
  echo "      from your working tree (not git), so your local edits WILL"
  echo "      ship in the image. The deployed commit shown above will not"
  echo "      reflect what's actually running."
  WARNINGS=$((WARNINGS+1))
fi
[ "${WARNINGS}" -gt 0 ] && echo "─────────────────────────────────────────────────────────────"

if [ "${SKIP_CONFIRM}" -eq 0 ]; then
  read -r -p "  Proceed? [y/N] " confirm
  case "${confirm}" in
    y|Y|yes|YES) ;;
    *) echo "  Aborted."; exit 0 ;;
  esac
fi

# ── 1. ACR login (uses AAD, no admin password) ───────────────────────────
echo
echo "▸ Logging in to ${REGISTRY}…"
az acr login --name "${REGISTRY_NAME}" >/dev/null

# ── 2. Buildx build + push ───────────────────────────────────────────────
# Mirror the original GHA: dual tag (sha + latest), registry cache for speed
# on subsequent runs. The cache image is namespaced under :buildcache to keep
# it separate from the runtime tags.
echo "▸ Building and pushing (this can take a few minutes on first run)…"
docker buildx build \
  --push \
  --tag "${REGISTRY}/${IMAGE}:${GIT_SHA_FULL}" \
  --tag "${REGISTRY}/${IMAGE}:latest" \
  --cache-from "type=registry,ref=${REGISTRY}/${IMAGE}:buildcache" \
  --cache-to "type=registry,ref=${REGISTRY}/${IMAGE}:buildcache,mode=max" \
  .

# ── 3. Smoke test ────────────────────────────────────────────────────────
# ACR webhook (cpctrackerCD) fires asynchronously; App Service may take a
# few minutes to pull and warm up. Poll for 200 every 10s, up to 5 minutes.
echo
echo "▸ Waiting for App Service to pull and warm up…"
for i in $(seq 1 30); do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 "${APP_URL}" || echo "timeout")
  printf "  [%2d/30] HTTP %s\n" "${i}" "${code}"
  if [ "${code}" = "200" ]; then
    echo
    echo "✅ Deploy successful: ${APP_URL}"
    echo "   Tag: ${REGISTRY}/${IMAGE}:${GIT_SHA_FULL}"
    exit 0
  fi
  sleep 10
done

echo
echo "❌ App did not return 200 within 5 minutes."
echo "   Check container logs:"
echo "   az webapp log tail --name cpc-tracker-c657 --resource-group undphqbppsai001"
exit 1
