#!/usr/bin/env bash
# Container entrypoint for App Service.
#
# Bridges the hardcoded `python/analyses/` and `python/output/` paths to
# `/home/cpc/...` so per-analysis state and the LLM cache survive container
# restarts via the App Service `/home` persistent mount.
#
# /home is provided by App Service when WEBSITES_ENABLE_APP_SERVICE_STORAGE=true.

set -euo pipefail

PERSIST_ROOT="${CPC_PERSIST_ROOT:-/home/cpc}"

mkdir -p "${PERSIST_ROOT}/analyses" "${PERSIST_ROOT}/output"

# Replace the in-image directories with symlinks to the persistent volume.
# `ln -sfn` overwrites existing symlinks atomically.
rm -rf /app/python/analyses
ln -sfn "${PERSIST_ROOT}/analyses" /app/python/analyses

# python/output is recreated empty by the image; if anything was baked in
# (e.g. pilot pre-computed runs), preserve it by copying once on first boot.
if [ -d /app/python/output ] && [ ! -L /app/python/output ]; then
    if [ -z "$(ls -A "${PERSIST_ROOT}/output" 2>/dev/null)" ]; then
        cp -an /app/python/output/. "${PERSIST_ROOT}/output/" || true
    fi
    rm -rf /app/python/output
fi
ln -sfn "${PERSIST_ROOT}/output" /app/python/output

exec pnpm start
