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

# Re-sync one bundled country directory from the image to the persistent
# volume. Stages to a sibling `.new`, then swaps via `mv` to keep the read
# window for any old container (during App Service deploy overlap) as
# short as possible. Each step uses `|| return 1` so `set -e` semantics
# survive being called from the `||` list below.
sync_country() {
    local src="$1"
    local country
    country=$(basename "${src}")
    # Skip dotfile dirs (e.g. .cache; .dockerignore'd but cheap to defend).
    case "${country}" in
        .*) return 0 ;;
    esac
    local target="${PERSIST_ROOT}/output/${country}"
    local staging="${target}.new"

    rm -rf "${staging}" || return 1
    cp -a "${src%/}" "${staging}" || return 1
    rm -rf "${target}" || return 1
    mv "${staging}" "${target}" || return 1
    printf '[start.sh] re-synced demo country: %s\n' "${country}"
    return 0
}

# On every fresh container start (deploy / scale-out / idle restart),
# refresh the bundled demo countries from the image to the persistent
# volume. Same model as a Vercel deploy: push to main → image rebuild →
# fresh container picks up the new bundle automatically.
#
# .cache (LLM cache; lives only on persistent) and per-analysis runs
# (under /home/cpc/analyses) are not touched. Loop matches directories
# only (`*/` glob); top-level files in the bundle are not propagated by
# design.
#
# Failure handling: a single country's sync failure is logged but does
# NOT abort container start (App Service `/home` is CIFS-mounted; SMB
# can return EBUSY/EIO when an old container holds open file handles).
# Stale demo data is preferable to a deploy loop.
#
# Side effect: any manual edits to /home/cpc/output/{country}/ via Kudu
# are blown away on next deploy. The image bundle is the source of truth.
if [ -d /app/python/output ] && [ ! -L /app/python/output ]; then
    for src in /app/python/output/*/; do
        if ! sync_country "${src}"; then
            printf '[start.sh] WARN: failed to re-sync %s; falling back to persistent volume contents\n' "${src}" >&2
        fi
    done
    # Seed the footprint ledger (a top-level file the dir-only loop above
    # skips) to the persistent volume on FIRST deploy only. Copy-if-absent so
    # live-recorded rows (chat + per-analysis pipeline runs) accumulate across
    # redeploys instead of being reset to the image baseline each restart.
    if [ -f /app/python/output/footprint-ledger.jsonl ] && \
       [ ! -f "${PERSIST_ROOT}/output/footprint-ledger.jsonl" ]; then
        if cp -a /app/python/output/footprint-ledger.jsonl "${PERSIST_ROOT}/output/footprint-ledger.jsonl"; then
            printf '[start.sh] seeded footprint ledger baseline\n'
        else
            printf '[start.sh] WARN: failed to seed footprint ledger\n' >&2
        fi
    fi
    rm -rf /app/python/output
fi
ln -sfn "${PERSIST_ROOT}/output" /app/python/output

exec pnpm start
