#!/usr/bin/env bash
# Container entrypoint for App Service.
#
# Bridges the hardcoded `python/analyses/` and `python/output/` paths to
# `/home/cpc/...` so per-analysis state and the LLM cache survive container
# restarts via the App Service `/home` persistent mount.
#
# /home is provided by App Service when WEBSITES_ENABLE_APP_SERVICE_STORAGE=true.

set -euo pipefail
shopt -s nullglob

PERSIST_ROOT="${CPC_PERSIST_ROOT:-/home/cpc}"

mkdir -p "${PERSIST_ROOT}/analyses" "${PERSIST_ROOT}/output"

# Replace the in-image directories with symlinks to the persistent volume.
# `ln -sfn` overwrites existing symlinks atomically.
rm -rf /app/python/analyses
ln -sfn "${PERSIST_ROOT}/analyses" /app/python/analyses

# On every fresh container start (deploy, scale-out, idle restart), re-sync
# the bundled demo countries from the image to the persistent volume. This
# means refreshes to `python/output/{country}/` baked into a new image
# always reach the running app — same model as a Vercel deploy. Anything
# else on the persistent volume (.cache LLM cache, future per-country
# additions) is left untouched.
#
# Side effect: any manual edits to /home/cpc/output/{country}/ via Kudu
# are blown away on next deploy. The image bundle is the source of truth.
if [ -d /app/python/output ] && [ ! -L /app/python/output ]; then
    for src in /app/python/output/*/; do
        country=$(basename "${src}")
        # Skip dotfile-style dirs (e.g. .cache, which is .dockerignore'd
        # but cheap to defend against here).
        case "${country}" in
            .*) continue ;;
        esac
        rm -rf "${PERSIST_ROOT}/output/${country}"
        cp -a "${src%/}" "${PERSIST_ROOT}/output/"
    done
    rm -rf /app/python/output
fi
ln -sfn "${PERSIST_ROOT}/output" /app/python/output

exec pnpm start
