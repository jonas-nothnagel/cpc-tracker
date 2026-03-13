"""
Fetch IMF Fossil Fuel Subsidy data from the ArcGIS Feature Service.

Data covers 170 countries with explicit and implicit subsidies by fuel type
(Coal, Electricity, Natural Gas, Petroleum) from 2015-2030.

Source: IMF Climate Change Indicators Dashboard
        https://climatedata.imf.org/datasets/d48cfd2124954fb0900cef95f2db2724_0

Usage:
    python -m src.data_sources.imf_subsidies --country Mongolia
    python -m src.data_sources.imf_subsidies --country Panama --iso3 PAN
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

FEATURE_SERVICE_URL = (
    "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/"
    "Indicator%2015%20Fossil%20Fuel%20Subsidies/FeatureServer/0/query"
)

SOURCE_CITATION = (
    "Black, Simon; Liu, Antung A.; Parry, Ian; Vernon, Nate. 2023. "
    "IMF Fossil Fuel Subsidies Data: 2023 Update. International Monetary Fund."
)

OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "external"

# Maps IMF indicator names to structured metadata.
# Subsidy components like "Congestion" and "Road Damage" are transport-related;
# everything else maps to the Energy IPCC sector.
TRANSPORT_COMPONENTS = {"Accidents", "Congestion", "Road Damage"}


def _parse_indicator(indicator: str) -> dict[str, str]:
    """Extract subsidy type and fuel type from an IMF indicator name."""
    parts = indicator.split(" - ", maxsplit=1)
    prefix = parts[0].strip()
    detail = parts[1].strip() if len(parts) > 1 else "Total"

    if "Explicit" in prefix:
        subsidy_type = "explicit"
    elif "Implicit" in prefix:
        subsidy_type = "implicit"
    else:
        subsidy_type = "total"

    return {"subsidyType": subsidy_type, "fuelType": detail}


def _year_fields(attrs: dict[str, Any]) -> dict[str, float]:
    """Extract year -> value pairs from F2015, F2016, ... fields."""
    values: dict[str, float] = {}
    for key, val in attrs.items():
        m = re.match(r"^F(\d{4})$", key)
        if m and val is not None:
            values[m.group(1)] = round(val, 6)
    return values


def fetch_subsidies(country: str, iso3: str | None = None) -> dict[str, Any]:
    """
    Fetch fossil fuel subsidy data for a country from the IMF ArcGIS service.

    Args:
        country: Country name as it appears in the IMF dataset (e.g. "Mongolia").
        iso3: Optional ISO3 code override. If not provided, taken from the first result.

    Returns:
        Structured dict with country info and subsidy series.
    """
    params = urllib.parse.urlencode({
        "where": f"Country='{country}'",
        "outFields": "*",
        "f": "json",
        "resultRecordCount": "500",
    })
    url = f"{FEATURE_SERVICE_URL}?{params}"

    logger.info(f"Fetching IMF subsidy data for {country}...")
    with urllib.request.urlopen(url, timeout=30) as resp:
        data = json.loads(resp.read().decode())

    features = data.get("features", [])
    if not features:
        logger.warning(f"No IMF subsidy data found for country='{country}'")
        return {"country": country, "iso3": iso3 or "", "source": SOURCE_CITATION, "subsidies": []}

    resolved_iso3 = iso3 or features[0]["attributes"].get("ISO3", "")

    subsidies: list[dict[str, Any]] = []
    for feat in features:
        attrs = feat["attributes"]
        indicator = attrs.get("Indicator", "")
        unit = attrs.get("Unit", "")
        parsed = _parse_indicator(indicator)
        yearly = _year_fields(attrs)

        if not any(v != 0 for v in yearly.values()):
            continue

        subsidies.append({
            "indicator": indicator,
            "fuelType": parsed["fuelType"],
            "subsidyType": parsed["subsidyType"],
            "unit": unit,
            "yearlyValues": yearly,
        })

    logger.info(f"  Found {len(subsidies)} non-zero subsidy series for {country} ({resolved_iso3})")

    return {
        "country": country,
        "iso3": resolved_iso3,
        "source": SOURCE_CITATION,
        "subsidies": subsidies,
    }


def save_subsidies(country: str, iso3: str | None = None) -> Path:
    """Fetch and save subsidy data to python/data/external/."""
    result = fetch_subsidies(country, iso3)
    resolved_iso3 = result["iso3"] or country[:3].upper()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"imf_subsidies_{resolved_iso3}.json"
    out_path.write_text(json.dumps(result, indent=2))
    logger.info(f"  Saved to {out_path}")
    return out_path


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")

    parser = argparse.ArgumentParser(description="Fetch IMF fossil fuel subsidy data")
    parser.add_argument("--country", required=True, help="Country name (e.g. Mongolia)")
    parser.add_argument("--iso3", default=None, help="ISO3 code override (e.g. MNG)")
    args = parser.parse_args()

    save_subsidies(args.country, args.iso3)


if __name__ == "__main__":
    main()
