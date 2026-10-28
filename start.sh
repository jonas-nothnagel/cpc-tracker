#!/usr/bin/env bash
# Container entrypoint for App Service.
#
# Bridges the hardcoded `python/analyses/` path, and what the site writes
# under `python/output/` while it runs (ledgers, feedback, analytics, the LLM
# cache), to `/home/cpc/...` so they survive container restarts via the App
# Service `/home` persistent mount. The countries' pipeline output is read
# from the image itself.
#
# /home is provided by App Service when WEBSITES_ENABLE_APP_SERVICE_STORAGE=true.

set -euo pipefail
shopt -s nullglob

PERSIST_ROOT="${CPC_PERSIST_ROOT:-/home/cpc}"

# What the site writes under python/output while it runs. These live only on
# the persistent volume: the country re-sync never copies them from the
# image, and python/output/<entry> is linked to the volume's copy below. A
# new runtime writer under python/output must be added here, or it writes to
# the container's own disk and is lost on restart. A folder deleted on the
# volume while the site runs is only recreated at the next start.
VOLUME_ENTRIES=(footprint-ledger.jsonl ratings-ledger.jsonl feedback analytics .cache)

mkdir -p "${PERSIST_ROOT}/analyses" "${PERSIST_ROOT}/output"

# Replace the in-image analyses directory with a symlink to the persistent
# volume. `ln -sfn` overwrites existing symlinks atomically.
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
    # Skip dotfile dirs (e.g. .cache; .dockerignore'd but cheap to defend)
    # and VOLUME_ENTRIES, which live only on the persistent volume and must
    # never be replaced from the image.
    case "${country}" in
        .*) return 0 ;;
    esac
    case " ${VOLUME_ENTRIES[*]} " in
        *" ${country} "*) return 0 ;;
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
# refresh the bundled countries from the image to the persistent volume.
# The site reads them from the image, and so does the storyline synthesis
# it runs in Python (its route points CPC_OUTPUT_DIR at the image). This
# copy is what the fallback at the end links when an image has no
# python/output; nothing else reads it now, and it can go once that holds.
#
# VOLUME_ENTRIES (ledgers, feedback, analytics, the LLM cache) and
# per-analysis runs (under /home/cpc/analyses) are not touched. Loop matches
# directories only (`*/` glob); top-level files in the bundle are not
# propagated by design.
#
# Failure handling: a single country's sync failure is logged but does
# NOT abort container start (App Service `/home` is CIFS-mounted; SMB
# can return EBUSY/EIO when an old container holds open file handles).
# A stale volume copy is preferable to a deploy loop.
#
# Side effect: any manual edits to /home/cpc/output/{country}/ via Kudu
# are blown away on next deploy and never reach the site. The image bundle
# is the source of truth.
if [ -d /app/python/output ] && [ ! -L /app/python/output ]; then
    for src in /app/python/output/*/; do
        if ! sync_country "${src}"; then
            printf '[start.sh] WARN: failed to re-sync %s; the volume keeps its previous copy\n' "${src}" >&2
        fi
    done
    # Reconcile the committed footprint ledger (a top-level file the dir-only
    # loop above skips) into the persistent volume on EVERY deploy. merge_ledger
    # keeps live-recorded rows (chat + per-analysis runs) while bringing forward
    # rows committed since the volume was first seeded -- a plain copy-if-absent
    # only ever ran on the first deploy, so the host fell behind the image.
    # Runs before the image's ledger is replaced by a link to this one below.
    if [ -f /app/python/output/footprint-ledger.jsonl ]; then
        if python3 /app/python/scripts/merge_ledger.py \
               /app/python/output/footprint-ledger.jsonl \
               "${PERSIST_ROOT}/output/footprint-ledger.jsonl"; then
            printf '[start.sh] merged footprint ledger into persistent volume\n'
        else
            printf '[start.sh] WARN: ledger merge failed; falling back to copy-if-absent\n' >&2
            [ -f "${PERSIST_ROOT}/output/footprint-ledger.jsonl" ] || \
                cp -a /app/python/output/footprint-ledger.jsonl \
                    "${PERSIST_ROOT}/output/footprint-ledger.jsonl" || true
        fi
    fi
    # Same reconcile treatment for the ratings ledger. Live reviewer clicks
    # append to /home/cpc/output/ratings-ledger.jsonl; the image's seed
    # (committed rows) merges in without clobbering live events. Rows are
    # deduped by canonical-JSON hash and sorted by ts.
    if [ -f /app/python/output/ratings-ledger.jsonl ]; then
        if python3 /app/python/scripts/merge_ledger.py \
               /app/python/output/ratings-ledger.jsonl \
               "${PERSIST_ROOT}/output/ratings-ledger.jsonl"; then
            printf '[start.sh] merged ratings ledger into persistent volume\n'
        else
            printf '[start.sh] WARN: ratings ledger merge failed; falling back to copy-if-absent\n' >&2
            [ -f "${PERSIST_ROOT}/output/ratings-ledger.jsonl" ] || \
                cp -a /app/python/output/ratings-ledger.jsonl \
                    "${PERSIST_ROOT}/output/ratings-ledger.jsonl" || true
        fi
    fi
    # The app reads each country's pipeline output from the image itself: the
    # same files its pages were built from at deploy, from local disk rather
    # than the SMB share. Only what is written while the site runs lives on
    # the persistent volume, linked in here: the footprint and ratings
    # ledgers (merged above; the app and Python runs append to them),
    # reviewers' feedback, usage analytics and the LLM cache.
    for entry in "${VOLUME_ENTRIES[@]}"; do
        # A ledger needs nothing here: the merge above wrote it, and the
        # first append through its link creates it otherwise. A folder must
        # exist for the writers' mkdir to pass through the link; failing to
        # create it is logged, not fatal, like the re-sync above.
        case "${entry}" in
            *.jsonl) ;;
            *) mkdir -p "${PERSIST_ROOT}/output/${entry}" ||
                   printf '[start.sh] WARN: could not create %s on the persistent volume\n' "${entry}" >&2 ;;
        esac
        rm -rf "/app/python/output/${entry}"
        ln -sfn "${PERSIST_ROOT}/output/${entry}" "/app/python/output/${entry}"
    done
    printf '[start.sh] country data read from the image; on the persistent volume: %s\n' "${VOLUME_ENTRIES[*]}"
else
    # Only reached when the image has no python/output folder (a build of
    # this repo always ships one): the whole folder then comes from the
    # persistent volume, as before the site read country data from the image.
    printf '[start.sh] WARN: no python/output folder in the image; linking the persistent volume copy\n' >&2
    ln -sfn "${PERSIST_ROOT}/output" /app/python/output
fi

exec pnpm start
