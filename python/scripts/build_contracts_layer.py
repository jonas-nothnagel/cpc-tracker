"""Bake a country's public contract record into the page's two files.

Deterministic: no AI, no re-run. Reads the August mirror of Mongolia's public
procurement portal (tender.gov.mn, via the NCTP staging platform) with the AI
readings made then (purpose screen, policy-area classification, comparison
with the targets), plus the country's targets and policy analysis, and writes:

  python/output/{country}/{model}/contracts.json.gz         the page payload
  python/output/{country}/{model}/contract-details.json.gz  each shown
      contract's record and the AI's explanations, read server side

The explanations predate the agreed vocabulary ("tension", "friction", "pulls
against"); contract_wording.py rewords them, deterministically.

Each contract is counted once. The record lists some contracts twice: the
same contract code, buyer, supplier and amount, at two workflow stages. The
copy at the most advanced stage is kept, and the readings of the dropped
copies join it. Framework lots signed with different suppliers stay apart.
Contracts in other currencies and rejected contracts are left out (the
counts are reported).

The mirror is gitignored and lives in the main checkout:

  cd python && .venv/bin/python scripts/build_contracts_layer.py \\
      --mirror /path/to/dev_data_scripts/nctp_mirror/data --country mongolia --model gpt-5-4
"""

from __future__ import annotations

import argparse
import gzip
import itertools
import json
import re
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from contract_places import AIMAGS, place_of  # noqa: E402
from contract_wording import agreed_wording  # noqa: E402

REPO = HERE.parents[1]

SOURCE = {"name": "tender.gov.mn", "url": "https://www.tender.gov.mn"}
# Tugrik per US$, indicative and flat across years (as in the August reports).
USD_RATE = 3500
MNT = "Төгрөг"
# A contract serving targets in this many documents or more is listed as
# serving many at once (the page states the threshold in its words).
MIN_DOCS = 3

TYPES = {
    "Бараа": "goods",
    "Ажил": "works",
    "Үйлчилгээ": "services",
    "Зөвлөх үйлчилгээ": "consulting",
    "Зөвлөхийн бус": "non_consulting",
    "Ерөнхий гэрээ": "framework",
    "Түлхүүр гардуулах гэрээ": "turnkey",
    "Гэрээ шууд": "direct",
    "Шууд худалдан авалтын гэрээ": "direct",
    "Цахим дэлгүүрийн бараа нийлүүлэх гэрээ": "e_shop",
}
STAGES = {
    "Шинэ": "new",
    "Зөвшөөрсөн": "approved",
    "Гүйцэтгэгч рүү илгээсэн": "sent",
    "Гүйцэтгэж байгаа": "in_progress",
    "Хаасан": "closed",
    "Татгалзсан": "rejected",
}
# Most advanced first: the copy kept when the record lists a contract twice.
STAGE_RANK = {"in_progress": 0, "closed": 1, "sent": 2, "approved": 3, "new": 4, "other": 5, "rejected": 6}
# Codes like "15" are clerks' running numbers, not contract codes.
TRIVIAL_CODE = r"\d{0,3}"
LENSES = ("globe", "ipcc", "gga")


def type_key(name: str | None) -> str:
    return TYPES.get((name or "").strip(), "other")


def stage_key(name: str | None) -> str:
    return STAGES.get((name or "").strip(), "other")


def valid_date(value: object) -> str | None:
    """An ISO date inside the record's plausible range; corrupt years (5377) are dropped."""
    if value is None:
        return None
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", str(value).strip())
    if not m or not 2000 <= int(m.group(1)) <= 2035:
        return None
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"


def dedupe(df: pd.DataFrame) -> tuple[pd.DataFrame, int, float]:
    """Each contract once: the same code, amount, buyer and supplier is one contract.

    Returns the kept rows (in their original order), the number of copies
    dropped and their value. `out.attrs["kept"]` maps each dropped id to the
    id kept in its place.
    """
    code = df["contract_code"].fillna("").astype(str).str.strip()
    trivial = code.str.fullmatch(TRIVIAL_CODE)
    ids = df["id"].astype(str)
    key = pd.Series(
        [
            f"\x1e{i}" if t else f"{c}\x1f{a}\x1f{b}\x1f{s}"
            for c, a, b, s, t, i in zip(
                code,
                df["amount"],
                df["client_name"].fillna(""),
                df["supplier_name"].fillna(""),
                trivial,
                ids,
            )
        ],
        index=df.index,
    )
    rank = df["status_name"].map(lambda s: STAGE_RANK[stage_key(s)])
    order = pd.DataFrame({"key": key, "rank": rank, "id": ids}, index=df.index).sort_values(["key", "rank", "id"])
    first = order.drop_duplicates("key")
    kept_by_key = dict(zip(first["key"], first["id"]))
    dropped = order.loc[~order.index.isin(first.index)]
    out = df.loc[df.index.isin(first.index)].copy()
    out.attrs["kept"] = {i: kept_by_key[k] for i, k in zip(dropped["id"], dropped["key"])}
    return out, len(dropped), float(df.loc[dropped.index, "amount"].sum())


CYRILLIC = re.compile("[\u0400-\u04ff]")


def english_of(text: str | None, lookup: dict[str, str]) -> str | None:
    """A record text in English: its machine translation, or the text itself
    when it is English already (no Cyrillic). Never the Mongolian."""
    if not text or not text.strip():
        return None
    found = lookup.get(text) or lookup.get(text.strip())
    if found:
        return found
    return None if CYRILLIC.search(text) else text.strip()


def lookup_file(path: Path) -> dict[str, str]:
    return json.loads(path.read_text()) if path.exists() else {}


def gz_json(path: Path, payload: object) -> None:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    path.write_bytes(gzip.compress(raw, mtime=0))


def place_totals(t: pd.DataFrame) -> list[dict]:
    """Every contract of the record by the one place its buyer or title names
    ("none" where it names no place or several), largest first."""
    codes = [place_of(b, n) for b, n in zip(t["client_name"], t["contract_name"])]
    keys = pd.Series([c if c and c != "several" else "none" for c in codes], index=t.index)
    g = t.groupby(keys)["amount"].agg(["size", "sum"]).sort_values("sum", ascending=False)
    return [{"code": str(k), "contracts": int(r["size"]), "value": float(r["sum"])} for k, r in g.iterrows()]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mirror", type=Path, default=REPO / "dev_data_scripts/nctp_mirror/data")
    ap.add_argument("--country", default="mongolia")
    ap.add_argument("--model", default="gpt-5-4")
    args = ap.parse_args()
    mirror: Path = args.mirror
    out_dir = REPO / "python/output" / args.country / args.model

    targets = json.loads((REPO / "python/data" / f"{args.country}-targets.json").read_text())
    doc_of = {t["id"]: t["sourceDocument"] for t in targets}
    policy = {
        frozenset((r["targetAId"], r["targetBId"])): r.get("alignment")
        for r in json.loads((out_dir / "alignment.json").read_text())
        if r.get("targetAId") in doc_of and r.get("targetBId") in doc_of
    }

    # ── The record, each contract once ──────────────────────────────────
    cols = [
        "id", "invitation_id", "contract_code", "contract_name", "contract_type_name", "amount",
        "currency_name", "status_name", "client_name", "supplier_name", "year", "start", "end", "contract_url",
        "crawled_at",
    ]
    t = pd.read_parquet(mirror / "tenders.parquet", columns=cols)
    t["id"] = t["id"].astype(str)
    t["invitation_id"] = t["invitation_id"].astype(str)
    other_currency = int((t["currency_name"] != MNT).sum())
    t = t[t["currency_name"] == MNT]
    rejected = int((t["status_name"].map(stage_key) == "rejected").sum())
    t = t[t["status_name"].map(stage_key) != "rejected"]
    t, dup_records, dup_value = dedupe(t)
    kept = t.attrs.get("kept", {})
    t = t.set_index("id", drop=False)

    def canon(i: str) -> str:
        return kept.get(i, i)

    purpose = pd.read_parquet(mirror / "tender_purpose.parquet")
    purpose["tender_id"] = purpose["tender_id"].astype(str).map(canon)
    purpose = purpose.drop_duplicates("tender_id").set_index("tender_id")
    t["tier"] = t["id"].map(purpose["purpose"]).fillna("none")
    reason = purpose["purpose_reasoning"].fillna("")

    cls = pd.read_parquet(mirror / "full_classification.parquet")
    cls = cls[cls["isPrimary"]].copy()
    cls["tender_id"] = cls["tender_id"].astype(str).map(canon)
    cls = cls.drop_duplicates(["tender_id", "taxonomy"])
    areas: dict[str, dict[str, str]] = {}
    for r in cls.itertuples():
        if r.taxonomy in LENSES:
            areas.setdefault(r.tender_id, {})[r.taxonomy] = r.category

    pairs = pd.read_parquet(mirror / "alignment_consolidated.parquet")
    pairs["tender_id"] = pairs["tender_id"].astype(str).map(canon)
    pairs = pairs[pairs["tender_id"].isin(t.index) & pairs["target_id"].isin(doc_of)]
    pairs = pairs.drop_duplicates(["tender_id", "target_id"])
    compared = set(pairs["tender_id"])
    strong = pairs[pairs["alignment"] == "high"]
    flagged = pairs[(pairs["alignment"] == "flagged") & (pairs["confidence"] == "high")]
    matches = strong.groupby("tender_id")["target_id"].apply(lambda s: sorted(set(s))).to_dict()
    misaligned = flagged.groupby("tender_id")["target_id"].apply(lambda s: sorted(set(s))).to_dict()

    mt: dict[str, str] = json.loads((mirror / "mt_lookup.json").read_text())
    mt.update(lookup_file(out_dir / "contract-titles.en.json"))
    buyers_en = lookup_file(out_dir / "contract-buyers.en.json")
    reasons_en = lookup_file(out_dir / "contract-reasons.en.json")

    def english(name: str | None) -> str | None:
        if not name:
            return None
        return mt.get(name) or mt.get(name.strip()) or None

    lots = t.groupby("invitation_id").size()

    # ── The payload ─────────────────────────────────────────────────────
    green = set(t.index[t["tier"].isin(["principal", "significant"])])
    shown = sorted(green | set(matches) | set(misaligned), key=lambda i: (-float(t.at[i, "amount"]), i))

    years = []
    for year, g in t.groupby("year"):
        row = {"year": int(year), "contracts": int(len(g)), "value": float(g["amount"].sum())}
        for tier in ("principal", "significant"):
            s = g[g["tier"] == tier]
            row[tier] = {"contracts": int(len(s)), "value": float(s["amount"].sum())}
        years.append(row)
    first_year, last_year = years[0]["year"], years[-1]["year"]
    # The record runs to the platform's snapshot (start dates can lie ahead).
    snapshot = str(t["crawled_at"].dropna().max())[:7]

    places = {i: place_of(t.at[i, "client_name"], t.at[i, "contract_name"]) for i in shown}
    contracts = []
    for i in shown:
        name = t.at[i, "contract_name"] or ""
        en = english(name)
        contracts.append(
            {
                "id": i,
                "tender": t.at[i, "invitation_id"],
                "year": int(t.at[i, "year"]),
                "tier": t.at[i, "tier"],
                "value": float(t.at[i, "amount"]),
                "title": en or name.strip(),
                "translated": en is not None,
                "place": places[i],
                "areas": areas.get(i, {}),
                "matches": matches.get(i, []),
                "misaligned": misaligned.get(i, []),
            }
        )

    def docs_served(i: str) -> set[str]:
        return {doc_of[x] for x in matches.get(i, [])}

    # The policy analysis on the target pairs that contracts serving many
    # documents serve: each distinct cross-document pair once.
    served_pairs: set[frozenset[str]] = set()
    for i in matches:
        if len(docs_served(i)) < MIN_DOCS:
            continue
        for a, b in itertools.combinations(matches[i], 2):
            if doc_of[a] != doc_of[b]:
                served_pairs.add(frozenset((a, b)))
    rated = [policy[p] for p in served_pairs if p in policy]
    agreement = {
        "high": sum(1 for r in rated if r == "high"),
        "flagged": sum(1 for r in rated if r == "flagged"),
        "total": len(rated),
    }

    faultline = []
    for i in sorted(matches, key=lambda i: (-float(t.at[i, "amount"]), i)):
        fl = [
            sorted((a, b))
            for a, b in itertools.combinations(matches[i], 2)
            if doc_of[a] != doc_of[b] and policy.get(frozenset((a, b))) == "flagged"
        ]
        if fl:
            faultline.append({"contract": i, "pairs": fl})

    candidates = [
        c
        for c in contracts
        if c["tier"] == "principal" and c["translated"] and c["place"] in AIMAGS and c["matches"]
    ]
    candidates.sort(key=lambda c: (-len(docs_served(c["id"])), -c["value"], c["id"]))
    example = candidates[0]["id"] if candidates else None

    payload = {
        "version": 1,
        "source": {
            **SOURCE,
            "firstYear": first_year,
            "lastYear": last_year,
            "snapshot": snapshot,
            "usdRate": USD_RATE,
            "duplicates": {"records": dup_records, "value": dup_value},
            "comparedOthers": int(sum(1 for i in compared if t.at[i, "tier"] == "none")),
            "excluded": {"otherCurrency": other_currency, "rejected": rejected},
        },
        "census": {
            "contracts": int(len(t)),
            "tenders": int(t["invitation_id"].nunique()),
            "value": float(t["amount"].sum()),
        },
        "years": years,
        # The whole record by place, for the map's all-contracts view.
        "places": place_totals(t),
        "contracts": contracts,
        "agreement": agreement,
        "faultline": faultline,
        "example": example,
    }

    def text(v: object) -> str:
        return "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v)

    strong_by = {i: g for i, g in strong.groupby("tender_id")}
    flagged_by = {i: g for i, g in flagged.groupby("tender_id")}
    details = {}
    for i in shown:
        name = t.at[i, "contract_name"] or ""
        details[i] = {
            "original": name.strip(),
            "english": english(name),
            "buyer": text(t.at[i, "client_name"]),
            "buyerEnglish": english_of(text(t.at[i, "client_name"]), buyers_en),
            "code": text(t.at[i, "contract_code"]),
            "type": type_key(t.at[i, "contract_type_name"]),
            "stage": stage_key(t.at[i, "status_name"]),
            "start": valid_date(t.at[i, "start"]),
            "end": valid_date(t.at[i, "end"]),
            "url": text(t.at[i, "contract_url"]),
            "reason": text(reason.get(i)),
            "reasonEnglish": english_of(text(reason.get(i)), reasons_en),
            "lots": int(lots.get(t.at[i, "invitation_id"], 1)),
            "strong": [
                {"target": r.target_id, "text": agreed_wording(text(r.description))}
                for r in strong_by[i].sort_values("target_id").itertuples()
            ]
            if i in strong_by
            else [],
            "misaligned": [
                {
                    "target": r.target_id,
                    "text": agreed_wording(text(r.description)),
                    "confidence": text(r.confidence),
                    "mechanism": text(r.mechanism) or None,
                }
                for r in flagged_by[i].sort_values("target_id").itertuples()
            ]
            if i in flagged_by
            else [],
        }

    gz_json(out_dir / "contracts.json.gz", payload)
    gz_json(out_dir / "contract-details.json.gz", details)

    # ── The page's figures, to check against the spec ───────────────────
    census = payload["census"]
    print(f"census: {census['contracts']:,} contracts, {census['tenders']:,} tenders, ₮{census['value'] / 1e12:.2f} trillion")
    print(f"  dropped: {dup_records:,} duplicate records (₮{dup_value / 1e9:,.1f} billion), "
          f"{other_currency} other-currency, {rejected} rejected")
    for tier in ("principal", "significant"):
        n = sum(y[tier]["contracts"] for y in years)
        v = sum(y[tier]["value"] for y in years)
        print(f"  {tier}: {n:,} contracts, ₮{v / 1e9:,.1f} billion, ₮{v / census['value'] * 100:.2f} of every ₮100")
    print(f"compared with targets: {len(compared):,} contracts ({payload['source']['comparedOthers']:,} not green)")
    covered = {x for i in matches for x in matches[i]}
    print(f"strongly matching: {len(matches):,} contracts; targets covered {len(covered)} of {len(doc_of)}, "
          f"none {len(doc_of) - len(covered)}")
    syn = [i for i in matches if len(docs_served(i)) >= MIN_DOCS]
    print(f"serving {MIN_DOCS}+ documents: {len(syn):,} contracts, ₮{sum(float(t.at[i, 'amount']) for i in syn) / 1e9:,.0f} billion; "
          f"agreement {agreement['high']}/{agreement['total']} high, {agreement['flagged']} potentially misaligned")
    print(f"fault line: {len(faultline):,} contracts")
    mis_tenders = {t.at[i, "invitation_id"] for i in misaligned}
    by_doc = Counter()
    for tender in mis_tenders:
        docs = {doc_of[x] for i in misaligned if t.at[i, "invitation_id"] == tender for x in misaligned[i]}
        by_doc.update(docs)
    top = by_doc.most_common(1)
    print(f"potentially misaligned: {len(mis_tenders)} tenders, {len(misaligned):,} contracts; "
          f"top document {top[0][0]} in {top[0][1] / max(1, len(mis_tenders)) * 100:.0f}%" if top else "potentially misaligned: none")
    placed = [i for i in green if places.get(i) and places[i] != "several"]
    gv = sum(float(t.at[i, "amount"]) for i in green)
    pv = sum(float(t.at[i, "amount"]) for i in placed)
    print(f"placed: {len(placed):,} of {len(green):,} green contracts ({pv / gv * 100:.0f}% of their value)")
    print(f"example: {example} {english(t.at[example, 'contract_name']) if example else ''}")
    print(f"wrote {out_dir / 'contracts.json.gz'} and contract-details.json.gz")


if __name__ == "__main__":
    main()
