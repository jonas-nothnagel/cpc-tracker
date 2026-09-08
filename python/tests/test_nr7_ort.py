"""Guards for the ORT-sourced NR7 input (src/nr7_ort.py).

Pure transformation only; no network. Pins the parts that bit us with the
PDF scrape: the national-target -> NBSAP map must come from the text, not a
table; the report's four narratives must stay separate; `reportedActions`
must be the Main Actions Summary; and the six-level ORT scale must land on
the four statuses the UI has labels for.
"""

from datetime import datetime, timezone

import pytest

from src.nr7_ort import (
    build_nr7_data,
    build_progress_items,
    latest_per_target,
    map_level,
    match_nbsap,
    parse_ort_csv,
    split_target,
)

_CSV = (
    "﻿\"Published on\",\"Unique ID\",\"Target\",\"Main Actions Summary\","
    "\"Progress Summary\",\"Key Challenges Summary\",\"Action Effectiveness Summary\","
    "\"Level of Progress\"\n"
    '"28-Feb-2026 18:58","ORT-NR7-MN-1-2","NT03. By 2030, 30% of the country\'s total area '
    'will be included in the protected area network.","Expanded the network by 1.2 million ha.\xa0'
    'Launched a finance mechanism.","Coverage reached 21%.","Remaining gap of 14 million ha.",'
    '"SMART monitoring on 21 areas.","On track to achieve target "\n'
    '"10-Jan-2026 09:00","ORT-NR7-MN-1-1","NT03. By 2030, 30% of the country\'s total area '
    'will be included in the protected area network.","OLD DRAFT","","","","Unknown"\n'
    '"28-Feb-2026 18:58","ORT-NR7-MN-2-1","NT04. By 2030, reduce the risk of extinction of '
    'threatened species.","Gene bank established.","","","",'
    '"Progress towards target but at an  insufficient rate"\n'
    '"28-Feb-2026 18:58","ORT-NR7-MN-3-1","NT06. By 2030, reduce pollution from all sources.",'
    '"","No change reported.","","","No significant change"\n'
)

_NBSAP = [
    {"id": "NBSAP_3", "sourceDocument": "NBSAP", "text": "By 2030, 30% of the country's total area will be included in the protected area network"},
    {"id": "NBSAP_4", "sourceDocument": "NBSAP", "text": "By 2030, Reduce the risk of extinction of threatened species"},
    {"id": "NBSAP_5", "sourceDocument": "NBSAP", "text": "By 2030, register and control invasive alien species"},
]


def test_map_level_folds_six_ort_levels_onto_four_statuses():
    assert map_level("On track to achieve target") == "on_track"
    assert map_level("Achieved") == "on_track"
    assert map_level("Progress towards target but at an  insufficient rate") == "limited"
    assert map_level(" No significant change ") == "no_progress"
    assert map_level("Unknown") == "unknown"
    assert map_level("Not applicable") == "unknown"
    assert map_level("") == "unknown"
    assert map_level("something new") == "unknown"


def test_split_target_separates_id_and_text():
    assert split_target("NT03. By 2030, thirty percent.") == ("NT03", "By 2030, thirty percent.")
    with pytest.raises(ValueError):
        split_target("By 2030, no id here")


def test_latest_per_target_keeps_the_most_recent_revision():
    rows = latest_per_target(parse_ort_csv(_CSV))
    assert [r["Target"][:4] for r in rows] == ["NT03", "NT04", "NT06"]
    assert rows[0]["Unique ID"] == "ORT-NR7-MN-1-2"


def test_match_nbsap_is_text_based_and_refuses_weak_matches():
    assert match_nbsap("By 2030, reduce the risk of extinction of threatened species.", _NBSAP)[0] == "NBSAP_4"
    nid, score = match_nbsap("By 2030, reduce pollution from all sources.", _NBSAP)
    assert nid is None and score < 0.85
    assert match_nbsap("anything", [])[0] is None


def test_build_progress_items_keeps_narratives_separate_and_actions_as_reported_actions():
    items = build_progress_items(parse_ort_csv(_CSV), _NBSAP)
    nt03 = items[0]
    assert nt03["targetId"] == "NT03"
    assert nt03["progressStatus"] == "on_track"
    assert nt03["levelOfProgress"] == "On track to achieve target"
    # NBSP from the export is normalised; the narrative is otherwise verbatim.
    assert nt03["mainActionsSummary"] == "Expanded the network by 1.2 million ha. Launched a finance mechanism."
    assert nt03["reportedActions"] == [nt03["mainActionsSummary"]]
    assert nt03["progressSummary"] == "Coverage reached 21%."
    assert nt03["keyChallengesSummary"] == "Remaining gap of 14 million ha."
    assert nt03["actionEffectivenessSummary"] == "SMART monitoring on 21 areas."
    # Legacy keys the progress panel reads are aliases of the named fields.
    assert nt03["challenges"] == nt03["keyChallengesSummary"]
    assert nt03["examples"] == nt03["actionEffectivenessSummary"]
    assert nt03["nbsapTargetId"] == "NBSAP_3"
    assert nt03["ortUniqueId"] == "ORT-NR7-MN-1-2"
    assert nt03["publishedOn"] == "2026-02-28"

    nt04 = items[1]
    assert nt04["nbsapTargetId"] == "NBSAP_4"  # NOT NBSAP_3: the map comes from the text
    assert nt04["progressStatus"] == "limited"

    nt06 = items[2]
    assert nt06["nbsapTargetId"] is None  # no NBSAP pollution target in this fixture
    assert nt06["reportedActions"] == []  # no actions narrative -> nothing to align
    assert nt06["mainActionsSummary"] is None
    assert nt06["progressSummary"] == "No change reported."


def test_build_nr7_data_carries_provenance_and_frontend_shape():
    data = build_nr7_data(
        "Mongolia", "mng", parse_ort_csv(_CSV), _NBSAP,
        fetched_at=datetime(2026, 9, 8, 10, 0, tzinfo=timezone.utc),
    )
    assert data["country"] == "Mongolia"
    assert data["iso3"] == "MNG"
    assert data["reportingPeriod"] == "2026"
    assert data["source"]["publishedOn"] == "2026-02-28"
    assert data["source"]["fetchedAt"] == "2026-09-08T10:00:00+00:00"
    assert data["source"]["url"].startswith("https://api.cbd.int/")
    assert {"targetId", "targetText", "progressStatus", "reportedActions"} <= set(data["progressItems"][0])
