"""Electricity-mix zone for region-accurate footprint estimation.

EcoLogits converts energy to CO2 using a grid carbon intensity that depends on
the electricity mix zone (ISO 3166-1 alpha-3). The same zone is applied to the
EcoLogits SDK init, the manual ``llm_impacts`` fallbacks, and the hosted chat
API call, so every component disaggregates by region consistently.
"""

from __future__ import annotations

import os


def electricity_zone() -> str:
    """ISO 3166-1 alpha-3 electricity-mix zone for footprint estimation.

    Default "USA": the production Azure OpenAI deployment runs in East US, and
    OpenAI's EcoLogits provider default is already "USA", so pinning it keeps the
    historical Mongolia/Panama numbers stable while making the region explicit
    and overridable (``CPC_ELECTRICITY_ZONE``) for other deployments.
    """
    return os.getenv("CPC_ELECTRICITY_ZONE", "USA")
