#!/usr/bin/env python3
"""Pull and synthesise the CPC user-feedback ledgers.

Each vote on an AI rationale / synthesis / storyline is appended as one JSONL
event by the /api/feedback route (see src/lib/feedback). This script:

  1. loads those per-country ledgers (locally, or pulled from Azure),
  2. folds the events to the current state per browser + surface + anchor
     (last event wins; "retracted" cancels a vote),
  3. cross-references the live pipeline output to mark each piece of feedback
     as live / superseded / orphaned (so feedback on text that has since
     changed is not mistaken for feedback on what ships today),
  4. prints a human summary and, optionally, writes a structured JSON export
     to drive a future feedback-loop / golden-set workflow.

Stdlib only: runs anywhere Python 3.9+ exists. Read-only; never writes the
ledgers.

Examples
--------
  # local, all countries
  python scripts/feedback_report.py

  # one country, also write a machine-readable export
  python scripts/feedback_report.py --country mongolia --json feedback.json

  # just the written notes (the hallucination-complaint signal)
  python scripts/feedback_report.py --comments-only

  # pull the ledgers off Azure first (needs SCM basic-auth creds in env)
  export CPC_KUDU_URL=https://<your-app>.scm.azurewebsites.net
  export CPC_KUDU_USER=... CPC_KUDU_PASS=...
  python scripts/feedback_report.py --remote --pull-to python/output/feedback
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import sys
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "python" / "output"

SURFACES = ("target_pair_rationale", "doc_pair_synthesis", "corpus_storyline")
SURFACE_LABEL = {
    "target_pair_rationale": "Pair rationales",
    "doc_pair_synthesis": "Doc-pair syntheses",
    "corpus_storyline": "Storylines",
}
ACTIVE = ("up", "down")


# ── identity helpers (MUST match src/lib/feedback/anchor.ts + hash.ts) ──────


def anchor_key(ids: list[str]) -> str:
    """Sorted ids joined with '__' (mirror of anchorKeyOf)."""
    return "__".join(sorted(ids))


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def slugify_anchor(text: str) -> str | None:
    """Mirror of slugifyAnchorId: NFC, lowercase, non-alphanumeric runs to '-',
    trim, cap at 128. Returns None when nothing alphanumeric survives."""
    norm = unicodedata.normalize("NFC", text).lower()
    out: list[str] = []
    prev_dash = False
    for ch in norm:
        if ch.isalnum():
            out.append(ch)
            prev_dash = False
        elif not prev_dash:
            out.append("-")
            prev_dash = True
    slug = "".join(out).strip("-")[:128]
    return slug if any(c.isalnum() for c in slug) else None


# ── loading events ──────────────────────────────────────────────────────────


def load_local_events(
    feedback_dir: Path, country: str | None
) -> dict[str, list[dict]]:
    """country -> list of events (file order preserved). Skips malformed lines,
    mirroring readFeedbackEvents."""
    events: dict[str, list[dict]] = {}
    if not feedback_dir.is_dir():
        return events
    for path in sorted(feedback_dir.glob("*.jsonl")):
        name = path.stem
        if country and name != country:
            continue
        rows: list[dict] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row, dict) and row.get("vote") in (
                "up",
                "down",
                "retracted",
            ):
                rows.append(row)
        if rows:
            events[name] = rows
    return events


# ── remote pull (Azure App Service / Kudu VFS) ───────────────────────────────


def pull_remote(dest_dir: Path) -> Path:
    """Download every *.jsonl under the remote feedback dir via the Kudu VFS
    API into dest_dir. Credentials and paths come from the environment."""
    base = os.environ.get("CPC_KUDU_URL", "").rstrip("/")
    user = os.environ.get("CPC_KUDU_USER", "")
    password = os.environ.get("CPC_KUDU_PASS", "")
    remote_path = os.environ.get(
        "CPC_REMOTE_FEEDBACK_PATH", "/home/cpc/output/feedback/"
    )
    if not (base and user and password):
        sys.exit(
            "Remote pull needs CPC_KUDU_URL, CPC_KUDU_USER and CPC_KUDU_PASS "
            "in the environment (App Service > Deployment Center > SCM "
            "basic-auth credentials)."
        )
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    headers = {"Authorization": f"Basic {token}"}
    if not remote_path.endswith("/"):
        remote_path += "/"
    listing_url = f"{base}/api/vfs{remote_path}"

    def get(url: str) -> bytes:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
            return resp.read()

    try:
        entries = json.loads(get(listing_url))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            print(f"No feedback directory at {remote_path} yet (nothing voted).")
            dest_dir.mkdir(parents=True, exist_ok=True)
            return dest_dir
        sys.exit(f"Kudu listing failed ({exc.code}): {listing_url}")
    except urllib.error.URLError as exc:
        sys.exit(f"Could not reach Kudu: {exc.reason}")

    dest_dir.mkdir(parents=True, exist_ok=True)
    pulled = 0
    for entry in entries:
        name = entry.get("name", "")
        if not name.endswith(".jsonl"):
            continue
        href = entry.get("href") or f"{listing_url}{name}"
        (dest_dir / name).write_bytes(get(href))
        pulled += 1
    print(f"Pulled {pulled} ledger file(s) from {base} into {dest_dir}")
    return dest_dir


# ── staleness: current pipeline output index ─────────────────────────────────


class CurrentIndex:
    """Lazily builds {anchorKey -> current content hash} per (surface, locale)
    from the live pipeline output, so feedback can be marked live/superseded."""

    def __init__(self, output_dir: Path, country: str):
        self.country_dir = output_dir / country
        self._cache: dict[tuple[str, str], dict[str, str] | None] = {}

    def available(self) -> bool:
        return self.country_dir.is_dir()

    def _load_json(self, filename: str):
        path = self.country_dir / filename
        if not path.is_file():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return None

    def _localised(self, base: str, locale: str) -> str | None:
        """Pick the locale-specific file when one exists, else the base file.
        Pair rationales are English-only; doc-pair and storyline texts have
        per-locale snapshots that the UI hashes in that locale."""
        if locale and locale != "en":
            localized = base.replace(".json", f".{locale}.json")
            if (self.country_dir / localized).is_file():
                return localized
        return base if (self.country_dir / base).is_file() else None

    def _build(self, surface: str, locale: str) -> dict[str, str] | None:
        index: dict[str, str] = {}
        if surface == "target_pair_rationale":
            found = False
            for fname in ("alignment.json", "measure_alignment.json"):
                data = self._load_json(fname)
                if not isinstance(data, list):
                    continue
                found = True
                for rec in data:
                    key = anchor_key([rec["targetAId"], rec["targetBId"]])
                    index[key] = content_hash(rec.get("description", ""))
            return index if found else None
        if surface == "doc_pair_synthesis":
            fname = self._localised("doc_pair_synthesis.json", locale)
            data = self._load_json(fname) if fname else None
            if not isinstance(data, list):
                return None
            for rec in data:
                if rec.get("synthesis_error") is not None:
                    continue
                syn = rec.get("synthesis") or {}
                text = "\n".join(
                    [
                        syn.get("storyline_name", ""),
                        syn.get("reinforce", ""),
                        syn.get("clash", ""),
                        syn.get("coordination_hint", ""),
                    ]
                )
                index[anchor_key([rec["doc_a"], rec["doc_b"]])] = content_hash(text)
            return index
        if surface == "corpus_storyline":
            fname = self._localised("corpus_themes.json", locale)
            data = self._load_json(fname) if fname else None
            storylines = data.get("storylines") if isinstance(data, dict) else None
            if not isinstance(storylines, list):
                return None
            for rec in storylines:
                slug = slugify_anchor(rec.get("name", ""))
                if slug:
                    index[slug] = content_hash(rec.get("description", ""))
            return index
        return None

    def lookup(self, surface: str, locale: str) -> dict[str, str] | None:
        cache_key = (surface, locale)
        if cache_key not in self._cache:
            self._cache[cache_key] = self._build(surface, locale)
        return self._cache[cache_key]


def status_of(event: dict, index: CurrentIndex | None) -> str:
    """live = text unchanged since vote; superseded = AI text changed;
    orphaned = the rated item is gone from current output; unchecked = no
    pipeline output to compare against."""
    if index is None or not index.available():
        return "unchecked"
    current = index.lookup(event["surface"], event.get("locale", "en"))
    if current is None:
        return "unchecked"
    key = event.get("anchorKey", "")
    if key not in current:
        return "orphaned"
    return "live" if current[key] == event.get("contentHash") else "superseded"


# ── folding + synthesis ──────────────────────────────────────────────────────


def fold(events: list[dict]) -> list[dict]:
    """Last event wins per (clientId, surface, anchorKey)."""
    latest: dict[tuple[str, str, str], dict] = {}
    for ev in events:
        latest[(ev.get("clientId"), ev.get("surface"), ev.get("anchorKey"))] = ev
    return list(latest.values())


def synthesise(
    events: list[dict], index: CurrentIndex | None
) -> dict:
    folded = fold(events)
    by_surface: dict[str, dict] = {
        s: {"up": 0, "down": 0, "retracted": 0, "with_comment": 0} for s in SURFACES
    }
    review: list[dict] = []
    items: list[dict] = []

    for ev in folded:
        surface = ev.get("surface")
        if surface not in by_surface:
            continue
        vote = ev.get("vote")
        status = status_of(ev, index)
        comment = ev.get("comment")
        bucket = by_surface[surface]
        bucket[vote] = bucket.get(vote, 0) + 1
        if comment:
            bucket["with_comment"] += 1
        item = {
            "surface": surface,
            "anchorKey": ev.get("anchorKey"),
            "anchorIds": ev.get("anchorIds"),
            "vote": vote,
            "comment": comment,
            "status": status,
            "locale": ev.get("locale"),
            "ts": ev.get("ts"),
            "contentHash": ev.get("contentHash"),
            "contentSnapshot": ev.get("contentSnapshot"),
            "context": ev.get("context", {}),
            "clientId": ev.get("clientId"),
        }
        items.append(item)
        # Review queue: anything negative or with a written note, newest first.
        if vote == "down" or comment:
            review.append(item)

    up = sum(b["up"] for b in by_surface.values())
    down = sum(b["down"] for b in by_surface.values())
    active = up + down
    review.sort(key=lambda i: i.get("ts") or "", reverse=True)
    return {
        "by_surface": by_surface,
        "totals": {
            "active": active,
            "up": up,
            "down": down,
            "helpful_pct": round(100 * up / active) if active else None,
            "with_comment": sum(b["with_comment"] for b in by_surface.values()),
            "events": len(events),
        },
        "review": review,
        "items": items,
    }


# ── output ───────────────────────────────────────────────────────────────────


def fmt_anchor(item: dict) -> str:
    ids = item.get("anchorIds") or []
    return " <-> ".join(ids) if len(ids) > 1 else (ids[0] if ids else item.get("anchorKey", ""))


def print_human(country: str, report: dict, comments_only: bool) -> None:
    t = report["totals"]
    print(f"\n{country.upper()}")
    if t["active"] == 0 and t["by_surface_retracted"] == 0 and not comments_only:
        print("  No active feedback.")
        return

    if not comments_only:
        for surface in SURFACES:
            b = report["by_surface"][surface]
            active = b["up"] + b["down"]
            if active == 0 and b["retracted"] == 0:
                continue
            extra = []
            if b["with_comment"]:
                extra.append(f"{b['with_comment']} with note")
            if b["retracted"]:
                extra.append(f"{b['retracted']} retracted")
            suffix = f"   ({', '.join(extra)})" if extra else ""
            noun = "vote " if active == 1 else "votes"
            print(
                f"  {SURFACE_LABEL[surface]:<20} {active:>3} {noun}  "
                f"{b['up']:>3} up   {b['down']:>3} down{suffix}"
            )
        pct = t["helpful_pct"]
        pct_s = f"   helpful {pct}%" if pct is not None else ""
        print(
            f"  Total active: {t['active']}{pct_s}   "
            f"notes: {t['with_comment']}   raw events: {t['events']}"
        )

    review = report["review"]
    if comments_only:
        review = [i for i in review if i.get("comment")]
    if review:
        print("\n  Review queue (not-helpful votes and notes, newest first):")
        for i in review:
            label = SURFACE_LABEL.get(i["surface"], i["surface"])
            date = (i.get("ts") or "")[:10]
            print(f"  [{i['vote']} | {i['status']}] {label}: {fmt_anchor(i)}  {date}")
            if i.get("comment"):
                print(f'      "{i["comment"]}"')
    elif comments_only:
        print("  No written notes.")


STATUS_LEGEND = (
    "Status: live = AI text unchanged since the vote; superseded = text changed "
    "in a later pipeline run; orphaned = the rated item is gone from current "
    "output; unchecked = no pipeline output to compare against."
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Synthesise CPC feedback ledgers.")
    parser.add_argument("--country", help="limit to one country id (e.g. mongolia)")
    parser.add_argument(
        "--feedback-dir",
        type=Path,
        help="directory of {country}.jsonl ledgers "
        "(default: $CPC_LEDGER_DIR/feedback or python/output/feedback)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="pipeline output root for staleness checks (default: python/output)",
    )
    parser.add_argument(
        "--no-check-current",
        action="store_true",
        help="skip the live-output staleness cross-reference",
    )
    parser.add_argument("--json", type=Path, help="write a structured JSON export")
    parser.add_argument(
        "--comments-only", action="store_true", help="print only written notes"
    )
    parser.add_argument(
        "--remote", action="store_true", help="pull ledgers from Azure (Kudu) first"
    )
    parser.add_argument(
        "--pull-to",
        type=Path,
        help="where --remote saves pulled ledgers (default: a .pulled temp dir)",
    )
    args = parser.parse_args()

    if args.remote:
        dest = args.pull_to or (DEFAULT_OUTPUT_DIR / "feedback" / ".pulled")
        feedback_dir = pull_remote(dest)
    elif args.feedback_dir:
        feedback_dir = args.feedback_dir
    else:
        env_dir = os.environ.get("CPC_LEDGER_DIR")
        feedback_dir = (
            Path(env_dir) / "feedback"
            if env_dir
            else DEFAULT_OUTPUT_DIR / "feedback"
        )

    events_by_country = load_local_events(feedback_dir, args.country)

    print(f"CPC feedback report  ({datetime.now(timezone.utc):%Y-%m-%d %H:%M UTC})")
    print(f"Source: {feedback_dir}")
    if not args.no_check_current:
        print(f"Staleness checked against: {args.output_dir}")
    print(STATUS_LEGEND)

    if not events_by_country:
        print("\nNo feedback recorded yet.")
        if args.json:
            args.json.write_text(
                json.dumps({"countries": {}}, indent=2), encoding="utf-8"
            )
        return

    export: dict = {
        "generated": f"{datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ}",
        "source": str(feedback_dir),
        "countries": {},
    }

    for country in sorted(events_by_country):
        index = (
            None
            if args.no_check_current
            else CurrentIndex(args.output_dir, country)
        )
        report = synthesise(events_by_country[country], index)
        # Convenience flag used by print_human.
        report["totals"]["by_surface_retracted"] = sum(
            b["retracted"] for b in report["by_surface"].values()
        )
        print_human(country, report, args.comments_only)
        export["countries"][country] = {
            "summary": {"by_surface": report["by_surface"], **report["totals"]},
            "items": report["items"],
        }

    if args.json:
        args.json.write_text(json.dumps(export, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nWrote structured export to {args.json}")


if __name__ == "__main__":
    main()
