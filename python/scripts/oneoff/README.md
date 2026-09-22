# One-off scripts (completed)

Scripts whose job is done: each ran once against a source that is no longer
expected to be present (uncommitted SharePoint exports, superseded corpus
revisions), and their results are committed to the repo. They are kept for
provenance — they document exactly how a committed dataset was produced —
not for reuse. Everything still in `python/scripts/` proper is reusable
tooling.

| Script | What it produced | When |
|---|---|---|
| `ingest_ldn_targets.py` | Mongolia LDN targets (NRVTS, ILDN) appended to `mongolia-targets.json` | 2026-05 |
| `translate_panama.py` | Spanish `textOriginal` fields on `panama-targets.json` | 2026-06 |
| `translate_mongolia_targets.py` | Mongolian `textOriginal` fields on `mongolia-targets.json` | 2026-06 |
| `build_mongolia_ber_report.py` | `Mongolia_BER_GLOBE_Report.xlsx` | 2026-06 |
| `build_mongolia_targets_revision.py` | The re-curated 178-target Mongolia corpus (NDC 3.0 / Resolution 91 split) | 2026-08 |

Do not run these against current data without re-reading them first: they
hardcode expected record counts and read paths from the state of the repo at
the time they ran.
