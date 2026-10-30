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
    build_indicators,
    build_nr7_data,
    build_progress_items,
    build_questionnaire,
    file_under_national_targets,
    gbf_to_national,
    latest_per_target,
    map_level,
    match_in_order,
    match_nbsap,
    national_target_map,
    normalise_response,
    parse_gbf_targets,
    parse_ort_csv,
    parse_value,
    split_indicator,
    split_target,
)

_CSV = (
    "﻿\"Published on\",\"Unique ID\",\"Target\",\"Main Actions Summary\","
    "\"Progress Summary\",\"Key Challenges Summary\",\"Action Effectiveness Summary\","
    "\"Level of Progress\",\"GBF Targets\"\n"
    '"28-Feb-2026 18:58","ORT-NR7-MN-1-2","NT03. By 2030, 30% of the country\'s total area '
    'will be included in the protected area network.","Expanded the network by 1.2 million ha.\xa0'
    'Launched a finance mechanism.","Coverage reached 21%.","Remaining gap of 14 million ha.",'
    '"SMART monitoring on 21 areas.","On track to achieve target ",'
    '"GBF-T03. 30% of areas are effectively conserved"\n'
    '"10-Jan-2026 09:00","ORT-NR7-MN-1-1","NT03. By 2030, 30% of the country\'s total area '
    'will be included in the protected area network.","OLD DRAFT","","","","Unknown",""\n'
    '"28-Feb-2026 18:58","ORT-NR7-MN-2-1","NT04. By 2030, reduce the risk of extinction of '
    'threatened species.","Gene bank established.","","","",'
    '"Progress towards target but at an  insufficient rate",'
    '"GBF-T04. Threatened species are recovering; GBF-T11. Nature\u2019s contributions to people '
    'are restored"\n'
    '"28-Feb-2026 18:58","ORT-NR7-MN-3-1","NT06. By 2030, reduce pollution from all sources.",'
    '"","No change reported.","","","No significant change",""\n'
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


def test_gbf_targets_come_from_the_tool_verbatim_and_tolerate_blanks():
    """The GBF axis is the country's own filing, never a hand map: one target,
    a "; "-joined pair (kept in filed order), a blank cell, and a cell the
    parser does not recognise (skipped, not invented)."""
    items = build_progress_items(parse_ort_csv(_CSV), _NBSAP)
    assert items[0]["gbfTargets"] == [
        {"id": "T03", "code": "GBF-T03", "title": "30% of areas are effectively conserved"}
    ]
    assert [g["id"] for g in items[1]["gbfTargets"]] == ["T04", "T11"]
    assert items[1]["gbfTargets"][1]["title"] == "Nature\u2019s contributions to people are restored"
    assert items[2]["gbfTargets"] == []
    assert parse_gbf_targets(None) == []
    assert parse_gbf_targets("GBF-T3 Heading without the dot") == [
        {"id": "T03", "code": "GBF-T03", "title": "Heading without the dot"}
    ]
    assert parse_gbf_targets("Target 3 conserved") == []


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


# ── Questionnaire (binary indicators) and indicator series (headline export) ──

_HEADLINE_CSV = (
    '"Published on","Unique ID","Target","Indicator","Indicator Type","Disaggregation","Year","Unit","Value","Footnote","Comments"\n'
    # 3.1 attached to NT03, two disaggregations with different units, repeated per revision
    '"28-Feb-2026 18:58","ORT-NR7ID-MN-1-2","NT03. Protected areas.","3.1 Coverage of protected areas","","Terrestrial","2020","%","20.77","",""\n'
    '"28-Feb-2026 18:58","ORT-NR7ID-MN-1-2","NT03. Protected areas.","3.1 Coverage of protected areas","","Terrestrial","2025","%","20.77","Same methodology as above.",""\n'
    '"28-Feb-2026 18:58","ORT-NR7ID-MN-1-2","NT03. Protected areas.","3.1 Coverage of protected areas","","OECM","2020","ha","1 500,5","",""\n'
    '"10-Jan-2026 09:00","ORT-NR7ID-MN-1-1","NT03. Protected areas.","3.1 Coverage of protected areas","","Terrestrial","2020","%","19.0","",""\n'
    # A.3 shared by two targets, no disaggregation, same points repeated per target
    '"28-Feb-2026 18:58","ORT-NR7ID-MN-2-1","NT01. Spatial planning.","A.3 Red List Index","","","2020","index","0.96","",""\n'
    '"28-Feb-2026 18:58","ORT-NR7ID-MN-2-1","NT01. Spatial planning.","A.3 Red List Index","","","2024","index","0.95","",""\n'
    '"28-Feb-2026 18:58","ORT-NR7ID-MN-2-1","NT04. Species.","A.3 Red List Index","","","2020","index","0.96","",""\n'
    '"28-Feb-2026 18:58","ORT-NR7ID-MN-2-1","NT04. Species.","A.3 Red List Index","","","2024","index","0.95","",""\n'
    # a component indicator with a non-numeric value
    '"28-Feb-2026 18:58","ORT-NR7ID-MN-3-1","NT04. Species.","A.CT.10 Living Planet Index","component","","2024","percent","n/a (not computed)","",""\n'
    # detached, no values, a country comment
    '"28-Feb-2026 18:57","ORT-NR7ID-MN-4-1","","18.2 Value of harmful subsidies","","","","","","","A national screening under the BIOFIN methodology is under way."\n'
    # national indicator without a code, one-year snapshot
    '"28-Feb-2026 18:58","ORT-NR7ID-MN-5-1","NT01. Spatial planning.","Ecosystem Category (WWF Mongolia)","national","Steppe","2020","hectares","17183524.3","",""\n'
)

_BINARY_CSV = (
    '"Published on","Unique ID","Target","Indicator","Indicator Code","Question Number","Question","Response"\n'
    '"28-Feb-2026 18:58","ORT-NR7BID-MN-1-1","NT12. Mainstreaming.","14.b Number of countries","14.b","14.2","Does your country use environmental economic accounting?","Under development"\n'
    '"28-Feb-2026 18:58","ORT-NR7BID-MN-1-1","NT12. Mainstreaming.","14.b Number of countries","14.b","14.2","Does your country use environmental economic accounting?","Under development"\n'
    '"28-Feb-2026 18:58","ORT-NR7BID-MN-1-1","NT12. Mainstreaming.","14.b Number of countries","14.b","14.3","Does your country integrate biodiversity into policies?","Yes"\n'
    '"10-Jan-2026 09:00","ORT-NR7BID-MN-1-0","NT12. Mainstreaming.","14.b Number of countries","14.b","14.3","Does your country integrate biodiversity into policies?","No"\n'
    '"28-Feb-2026 18:58","ORT-NR7BID-MN-2-1","NT01. Spatial planning.","1.b Number of countries","1.b","1.2","Were the plans created for terrestrial or marine planning?","forTerrestrialPlanning"\n'
    '"28-Feb-2026 18:58","ORT-NR7BID-MN-2-1","NT01. Spatial planning.","1.b Number of countries","1.b","","","Yes"\n'
)


def test_parse_value_and_response_helpers():
    assert parse_value("20.77") == 20.77
    assert parse_value("1 500,5") == 15005.0  # export uses separators, never decimal commas
    assert parse_value("n/a (not computed)") is None
    assert parse_value("") is None
    assert normalise_response("Under development") == "under_development"
    assert normalise_response("underDevelopment") == "under_development"
    assert normalise_response("Partially") == "partially"
    assert normalise_response("forTerrestrialPlanning") is None
    assert split_indicator("3.1 Coverage of protected areas") == ("3.1", "Coverage of protected areas")
    assert split_indicator("A.CT.10 Living Planet Index") == ("A.CT.10", "Living Planet Index")
    assert split_indicator("Ecosystem Category (WWF Mongolia)") == (None, "Ecosystem Category (WWF Mongolia)")


def test_build_indicators_dedupes_points_and_collects_target_attachments():
    ind = {i["id"]: i for i in build_indicators(parse_ort_csv(_HEADLINE_CSV))}
    assert set(ind) == {"3.1", "A.3", "A.CT.10", "18.2", "ecosystem-category-wwf-mongolia"}

    pa = ind["3.1"]
    assert pa["code"] == "3.1" and pa["name"] == "Coverage of protected areas"
    assert pa["indicatorType"] == "headline" and pa["targetIds"] == ["NT03"]
    by_disagg = {s["disaggregation"]: s for s in pa["series"]}
    assert set(by_disagg) == {"Terrestrial", "OECM"}
    # Unit lives on the series; the latest revision wins over the January draft.
    assert by_disagg["Terrestrial"]["unit"] == "%"
    assert [p["value"] for p in by_disagg["Terrestrial"]["points"]] == [20.77, 20.77]
    assert by_disagg["Terrestrial"]["points"][1]["footnote"] == "Same methodology as above."
    assert by_disagg["OECM"]["unit"] == "ha" and by_disagg["OECM"]["points"][0]["value"] == 15005.0

    rli = ind["A.3"]
    assert rli["targetIds"] == ["NT01", "NT04"]
    assert len(rli["series"]) == 1 and rli["series"][0]["disaggregation"] is None
    assert [p["year"] for p in rli["series"][0]["points"]] == [2020, 2024]  # not 4: shared rows collapse

    lpi = ind["A.CT.10"]
    assert lpi["indicatorType"] == "component"
    assert lpi["series"][0]["points"][0] == {"year": 2024, "value": None, "valueText": "n/a (not computed)", "footnote": None}

    sub = ind["18.2"]
    assert sub["targetIds"] == [] and sub["series"] == []
    assert sub["comments"].startswith("A national screening")

    wwf = ind["ecosystem-category-wwf-mongolia"]
    assert wwf["code"] is None and wwf["indicatorType"] == "national"
    assert wwf["series"][0]["points"][0]["value"] == 17183524.3


def test_build_questionnaire_keeps_wording_dedupes_and_marks_scale_answers():
    answers = build_questionnaire(parse_ort_csv(_BINARY_CSV))["answers"]
    keys = [(a["targetId"], a["questionNumber"]) for a in answers]
    assert keys == [("NT01", "1.2"), ("NT12", "14.2"), ("NT12", "14.3")]  # rows without a question number are dropped
    q142 = next(a for a in answers if a["questionNumber"] == "14.2")
    assert q142["questionTitle"] == "Does your country use environmental economic accounting?"
    assert q142["response"] == "Under development" and q142["responseValue"] == "under_development"
    assert q142["indicatorCode"] == "14.b" and q142["publishedOn"] == "2026-02-28"
    q143 = next(a for a in answers if a["questionNumber"] == "14.3")
    assert q143["response"] == "Yes"  # the February revision replaces January's "No"
    enum = next(a for a in answers if a["targetId"] == "NT01")
    assert enum["response"] == "forTerrestrialPlanning" and enum["responseValue"] is None


def test_questionnaire_without_wording_column_is_tolerated():
    csv_no_question = _BINARY_CSV.replace(',"Question"', "").replace(
        ',"Does your country use environmental economic accounting?"', ""
    ).replace(',"Does your country integrate biodiversity into policies?"', "").replace(
        ',"Were the plans created for terrestrial or marine planning?"', ""
    ).replace(',""\n', "\n")
    answers = build_questionnaire(parse_ort_csv(csv_no_question))["answers"]
    assert answers and all(a["questionTitle"] is None for a in answers)


def test_build_nr7_data_carries_the_new_sections_and_leaves_progress_items_unchanged():
    base = build_nr7_data("Mongolia", "mng", parse_ort_csv(_CSV), _NBSAP)
    full = build_nr7_data(
        "Mongolia", "mng", parse_ort_csv(_CSV), _NBSAP,
        headline_rows=parse_ort_csv(_HEADLINE_CSV), binary_rows=parse_ort_csv(_BINARY_CSV),
    )
    # The alignment step reads only progressItems; its shape must not move.
    assert [set(i) for i in base["progressItems"]] == [set(i) for i in full["progressItems"]]
    assert base["questionnaire"] == {"answers": []} and base["indicators"] == []
    assert base["source"]["sections"] == ["Section III (national targets)"]
    assert len(full["questionnaire"]["answers"]) == 3 and len(full["indicators"]) == 5
    assert full["source"]["sections"] == [
        "Section III (national targets)",
        "Headline and other indicators",
        "Binary indicators (questionnaire)",
    ]


def test_split_target_reads_every_country_heading_onto_one_id():
    assert split_target("Meta Nacional 13. Implementación del Protocolo") == ("NT13", "Implementación del Protocolo")
    assert split_target("National Goal 1. 11% reduction of GHG by 2035") == ("NT01", "11% reduction of GHG by 2035")
    assert split_target("National Target 1: Restore ecosystems") == ("NT01", "Restore ecosystems")
    assert split_target("National Target 16 - Ensure gender equality") == ("NT16", "Ensure gender equality")


def test_the_top_of_the_scale_reads_the_same_in_either_wording():
    assert normalise_response("Fully") == "yes"
    assert normalise_response("Yes") == "yes"


def test_match_in_order_finds_short_titles_in_the_documents_order():
    corpus = [
        {"id": "NP_1", "text": "Coordination among institutions is strengthened."},
        {"id": "NP_2", "text": "By 2035, reduce greenhouse gas emissions by 11%.", "textOriginal": "Reducir 11% los gases"},
        {"id": "NP_3", "text": "Restore 100,000 hectares by 2035.", "textOriginal": "Restauración de 100,000 hectáreas al 2035"},
        {"id": "NP_4", "text": "Reduce plastic pollution by half.", "textOriginal": "Contaminación plástica reducida"},
    ]
    out = match_in_order([("NT01", "11% reduction of greenhouse gases"), ("NT02", "Restauración de 100,000 hectáreas")], corpus)
    assert out["NT01"][0] == "NP_2"
    assert out["NT02"][0] == "NP_3"


def test_match_in_order_leaves_a_pair_with_too_few_shared_words_unmatched():
    corpus = [{"id": "NP_1", "text": "Reduce plastic pollution by half across coastal provinces."}]
    assert match_in_order([("NT01", "Early warning systems for pollution incidents nationwide")], corpus)["NT01"][0] is None


_NATIONAL = national_target_map(
    [
        {"National target title": "National Target 1: Restore ecosystems", "Degree of Alignment by target": "High - GBF-T02. Restoration; High - GBF-T11. Contributions"},
        {"National target title": "National Target 2 - Mainstream biodiversity", "Degree of Alignment by target": "Medium - GBF-T01. Planning; none - GBF-T12. Urban"},
    ]
)


def test_national_target_map_reads_heading_and_gbf_without_the_degree():
    assert _NATIONAL["NT02"]["heading"] == "National Target 2 - Mainstream biodiversity"
    assert [g["id"] for g in _NATIONAL["NT02"]["gbf"]] == ["T01", "T12"]
    assert gbf_to_national(_NATIONAL) == {"T02": "NT01", "T11": "NT01", "T01": "NT02", "T12": "NT02"}


def _row(target: str, actions: str, level: str, challenges: str = "") -> dict[str, str]:
    return {
        "Target": target,
        "Main Actions Summary": actions,
        "Progress Summary": "",
        "Key Challenges Summary": challenges,
        "Action Effectiveness Summary": "",
        "Level of Progress": level,
        "GBF Targets": "",
    }


def test_rows_filed_under_gbf_targets_land_on_their_national_target():
    on_track, behind = "On track to achieve target", "Progress towards target but at an  insufficient rate"
    rows = [
        _row("National Target 1: Restore ecosystems", "Replanting programme", on_track),
        _row("", "Land use policy amended", on_track, "Policy gap"),
        _row("", "Green cities pilot", behind, "No data"),
    ]
    keys = [
        {"target": "UUID", "targetType": "national", "start": "replantingprogramme"},
        {"target": "GBF-TARGET-01", "targetType": "global", "start": "landusepolicyamended"},
        {"target": "GBF-TARGET-12", "targetType": "global", "start": "greencitiespilot"},
    ]
    out = file_under_national_targets(rows, keys, _NATIONAL)
    assert [split_target(r["Target"])[0] for r in out] == ["NT01", "NT02"]
    merged = out[1]
    assert merged["Level of Progress"] == behind, "a target carries its least advanced row"
    assert merged["Key Challenges Summary"] == "GBF-T01: Policy gap\n\nGBF-T12: No data"
    assert [g["id"] for g in parse_gbf_targets(merged["GBF Targets"])] == ["T01", "T12"]


def test_a_row_with_no_report_record_stops_the_build():
    with pytest.raises(ValueError):
        file_under_national_targets([_row("", "Unknown row", "Unknown")], [], _NATIONAL)


def test_indicators_and_answers_filed_under_a_gbf_target_reach_the_national_target():
    gbf = gbf_to_national(_NATIONAL)
    answers = build_questionnaire(
        [{"Target": "GBF-T12. Urban", "Indicator": "12.b", "Indicator Code": "12.b", "Question Number": "1", "Response": "Partially"}],
        gbf,
    )["answers"]
    assert answers[0]["targetId"] == "NT02"


def test_national_target_map_keeps_the_latest_revision_in_either_order():
    newer = {
        "Published on": "21-May-2026 09:51",
        "National target title": "National Target 1: Restore ecosystems",
        "Degree of Alignment by target": "High - GBF-T02. Restoration",
    }
    older = {**newer, "Published on": "01-Jan-2026 09:51", "National target title": "National Target 1: Old wording"}
    for rows in ([newer, older], [older, newer]):
        assert national_target_map(rows)["NT01"]["heading"] == newer["National target title"]


def test_gbf_target_under_two_national_targets_stops_the_build():
    national = national_target_map(
        [
            {"National target title": "National Target 1: A", "Degree of Alignment by target": "High - GBF-T02. Restoration"},
            {"National target title": "National Target 2: B", "Degree of Alignment by target": "High - GBF-T02. Restoration"},
        ]
    )
    with pytest.raises(ValueError, match="T02"):
        gbf_to_national(national)


def test_a_revised_row_replaces_its_earlier_revision_before_the_merge():
    national = national_target_map(
        [{"National target title": "National Target 1: Restore", "Degree of Alignment by target": "High - GBF-T02. Restoration"}]
    )
    keys = [{"target": "GBF-TARGET-2", "start": "actionstaken"}]
    row = {"Target": "", "Main Actions Summary": "Actions taken", "Progress Summary": "Newer", "Level of Progress": "On track to achieve target"}
    newer = {**row, "Published on": "21-May-2026 09:51"}
    older = {**row, "Published on": "01-Jan-2026 09:51", "Progress Summary": "Older", "Level of Progress": "No significant change"}
    merged = file_under_national_targets([older, newer], keys, national)
    assert len(merged) == 1
    assert merged[0]["Progress Summary"] == "Newer"
    assert map_level(merged[0]["Level of Progress"]) == "on_track"


def test_a_passage_of_web_addresses_is_not_sent_for_translation():
    from scripts.translate_nr7 import passages

    report = {
        "progressItems": [
            {
                "targetId": "NT01",
                "progressSummary": "Se avanzó. https://example.org/a",
                "actionEffectivenessSummary": "https://example.org/a.pdf https://doi.org/10.37387/ipc.v9i2.232 ",
            }
        ],
        "indicators": [],
    }
    assert [where for where, _ in passages(report)] == [("targets", "NT01", "progress")]


@pytest.mark.parametrize("iso3,locale", [("pan", "en"), ("mng", "mn")])
def test_an_overlay_holds_what_the_script_sends_and_nothing_else(iso3, locale):
    import json
    from pathlib import Path

    from scripts.translate_nr7 import passages

    external = Path(__file__).resolve().parents[1] / "data" / "external"
    report = json.loads((external / f"nr7_{iso3}.json").read_text())
    overlay = json.loads((external / f"nr7_{iso3}.{locale}.json").read_text())
    held = {(section, ident, key) for section in ("targets", "indicators") for ident, v in overlay[section].items() for key in v}
    assert held == {where for where, _ in passages(report)}
    assert not any("paste the" in text for v in overlay["targets"].values() for text in v.values())
