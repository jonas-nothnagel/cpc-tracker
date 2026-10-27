"""The official chain's one AI step: a budget line's BIOFIN expenditure type,
read by two models, and the GBF targets both readings lead to."""

from src.ber_types import chain_reading, relevant_gbf, type_categories

GBF = {"7.01.12": [1, 3], "7.01.16": [15, 19], "7.01.06": [9, 22], "6.06.01": [7], "2.04.05": [1, 21]}


def ranked(*pairs):
    return [{"id": i, "score": s, "reasoning": ""} for i, s in pairs]


def test_relevant_gbf_reads_every_type_at_the_mark():
    assert relevant_gbf(ranked(("7.01.12", 0.9), ("7.01.16", 0.5), ("7.01.06", 0.4)), GBF) == {1, 3, 15, 19}


def test_a_line_links_through_the_gbf_targets_both_readings_share():
    # Mongolia's 71405 in the smoke run: both models put it in 7.01.12.
    first = ranked(("7.01.12", 0.9), ("7.01.16", 0.8))
    second = ranked(("7.01.12", 0.75), ("7.01.06", 0.5), ("7.01.16", 0.4))
    reading = chain_reading(first, second, GBF)
    assert reading == {"type": "7.01.12", "typeStatus": "models-agree", "gbf": [1, 3], "status": "linked"}


def test_readings_that_share_no_gbf_target_keep_the_line_apart():
    # Mongolia's 71408 Meteorology in the smoke run.
    reading = chain_reading(ranked(("6.06.01", 0.7)), ranked(("2.04.05", 0.5)), GBF)
    assert reading == {"type": "6.06.01", "typeStatus": "models-differ", "gbf": [], "status": "apart"}


def test_below_the_mark_there_is_no_type_and_no_link():
    reading = chain_reading(ranked(("7.01.12", 0.4)), ranked(("7.01.12", 0.9)), GBF)
    assert reading["type"] is None and reading["typeStatus"] == "no-clear-type"
    assert reading["status"] == "apart"


def test_one_model_alone_links_on_its_own_reading():
    reading = chain_reading(ranked(("7.01.12", 0.6)), None, GBF)
    assert reading == {"type": "7.01.12", "typeStatus": "one-model", "gbf": [1, 3], "status": "linked"}


def test_catalogue_is_the_workbooks_own_words():
    [cat] = type_categories([{"id": "7.01.12", "name": "Border patrol", "definition": "Patrols.", "examples": "staff costs"}])
    assert cat == {"id": "7.01.12", "name": "Border patrol", "description": "Patrols. May include: staff costs"}
