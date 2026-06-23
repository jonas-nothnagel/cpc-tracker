"""
Fetch OECD Agricultural Support Estimates (Producer Support Estimate / PSE).

Data from the OECD Agricultural Policy Monitoring and Evaluation dataset
(MON2022_REFERENCE_TABLE). Covers ~30 countries including OECD members and
key partners (Brazil, China, India, etc.). Mongolia and Panama are not covered.

The script gracefully handles missing countries: logs a warning and returns
an empty result rather than crashing.

Source: https://data-explorer.oecd.org/

Usage:
    python -m src.data_sources.oecd_agri --iso3 TUR
    python -m src.data_sources.oecd_agri --iso3 MNG  # will warn: not available
"""

from __future__ import annotations

import argparse
import json
import logging
import urllib.request
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# PSE headline indicators we care about
INDICATORS = {
    "TO-PSEP": "Total Producer Support Estimate",
    "TO-GSSE": "General Services Support Estimate",
    "TO-TSE": "Total Support Estimate",
}

MEASURES = {"PC": "Percent", "USD": "USD millions"}

API_URL = (
    "https://stats.oecd.org/SDMX-JSON/data/MON2022_REFERENCE_TABLE/"
    "{country}.{indicator}.{measure}/all"
    "?startTime={start}&endTime={end}"
)

OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "external"

SOURCE_CITATION = (
    "OECD. Agricultural Policy Monitoring and Evaluation. "
    "Producer Support Estimates database. https://data-explorer.oecd.org/"
)


def _parse_sdmx_response(raw: dict[str, Any], target_iso3: str) -> list[dict[str, Any]]:
    """
    Parse the OECD SDMX-JSON response into a flat list of indicator series.

    The SDMX-JSON format nests data in a complex dimension-indexed structure.
    Series keys are colon-separated dimension indices (e.g., "5:3:2")
    mapping to LOCATION, PSECSE_INDICATOR, and MEASURE dimensions.
    """
    structures = raw.get("data", {}).get("structures", [{}])
    if not structures:
        return []

    dims = structures[0].get("dimensions", {}).get("series", [])
    obs_dims = structures[0].get("dimensions", {}).get("observation", [])

    loc_values = next((d["values"] for d in dims if d["id"] == "LOCATION"), [])
    ind_values = next((d["values"] for d in dims if d["id"] == "PSECSE_INDICATOR"), [])
    meas_values = next((d["values"] for d in dims if d["id"] == "MEASURE"), [])
    time_values = next((d["values"] for d in obs_dims if d["id"] == "TIME_PERIOD"), [])

    loc_idx = None
    for i, v in enumerate(loc_values):
        if v["id"].upper() == target_iso3.upper():
            loc_idx = i
            break

    if loc_idx is None:
        available = [v["id"] for v in loc_values]
        logger.warning(
            f"{target_iso3} not found in OECD PSE dataset. "
            f"Available countries: {', '.join(available)}"
        )
        return []

    datasets = raw.get("data", {}).get("dataSets", [{}])
    if not datasets:
        return []

    all_series = datasets[0].get("series", {})
    result: list[dict[str, Any]] = []

    for key, series_data in all_series.items():
        parts = key.split(":")
        if len(parts) < 3:
            continue

        s_loc, s_ind, s_meas = int(parts[0]), int(parts[1]), int(parts[2])
        if s_loc != loc_idx:
            continue

        indicator_id = ind_values[s_ind]["id"] if s_ind < len(ind_values) else "?"
        indicator_name = ind_values[s_ind].get("name", indicator_id)
        measure_id = meas_values[s_meas]["id"] if s_meas < len(meas_values) else "?"
        measure_name = meas_values[s_meas].get("name", measure_id)

        if indicator_id not in INDICATORS:
            continue
        if measure_id not in MEASURES:
            continue

        yearly: dict[str, float] = {}
        for obs_key, obs_val in series_data.get("observations", {}).items():
            t_idx = int(obs_key)
            if t_idx < len(time_values):
                year = time_values[t_idx]["id"]
                value = obs_val[0] if obs_val and obs_val[0] is not None else None
                if value is not None:
                    yearly[year] = round(value, 4)

        if not yearly:
            continue

        result.append({
            "indicator": INDICATORS.get(indicator_id, indicator_name),
            "indicatorId": indicator_id,
            "unit": measure_name,
            "unitId": measure_id,
            "yearlyValues": dict(sorted(yearly.items())),
        })

    return result


def fetch_agri_support(
    iso3: str,
    start_year: int = 2010,
    end_year: int = 2024,
) -> dict[str, Any]:
    """
    Fetch OECD agricultural support data for a country.

    Makes one request per indicator+measure combo (the OECD SDMX API doesn't
    reliably filter on compound queries with + separators).

    Returns empty support list if the country is not in the OECD PSE database.
    """
    logger.info(f"Fetching OECD agricultural support data for {iso3}...")

    all_series: list[dict[str, Any]] = []
    country_checked = False
    for ind_id in INDICATORS:
        for meas_id in ["PC", "USD"]:
            url = API_URL.format(
                country=iso3.upper(),
                indicator=ind_id,
                measure=meas_id,
                start=start_year,
                end=end_year,
            )
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "CPC-Analyzer/1.0"})
                with urllib.request.urlopen(req, timeout=60) as resp:
                    data = json.loads(resp.read().decode())

                if not country_checked:
                    country_checked = True
                    structures = data.get("data", {}).get("structures", [{}])
                    if structures:
                        dims = structures[0].get("dimensions", {}).get("series", [])
                        loc_vals = next((d["values"] for d in dims if d["id"] == "LOCATION"), [])
                        available = [v["id"] for v in loc_vals]
                        if iso3.upper() not in available:
                            logger.warning(
                                f"{iso3} not in OECD PSE dataset. "
                                f"Available: {', '.join(available)}"
                            )
                            break

                series = _parse_sdmx_response(data, iso3)
                all_series.extend(series)
            except Exception as e:
                logger.debug(f"  Request failed for {ind_id}/{meas_id}: {e}")
                continue
        else:
            continue
        break

    if not all_series:
        logger.warning(
            f"No OECD agricultural support data found for {iso3}. "
            f"This country may not be in the OECD PSE database."
        )

    logger.info(f"  Found {len(all_series)} support series for {iso3}")

    return {
        "country": iso3,
        "iso3": iso3,
        "source": SOURCE_CITATION,
        "support": all_series,
    }


def save_agri_support(iso3: str) -> Path:
    """Fetch and save agricultural support data."""
    result = fetch_agri_support(iso3)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"oecd_agri_{iso3.upper()}.json"
    out_path.write_text(json.dumps(result, indent=2))
    logger.info(f"  Saved to {out_path}")
    return out_path


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")

    parser = argparse.ArgumentParser(description="Fetch OECD agricultural support data")
    parser.add_argument("--iso3", required=True, help="ISO3 country code (e.g. TUR, USA)")
    args = parser.parse_args()

    save_agri_support(args.iso3)


if __name__ == "__main__":
    main()
