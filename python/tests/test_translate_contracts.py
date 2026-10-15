"""English for the contracts page: which texts go to the model, and the
footprint every run leaves in the ledger."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from translate_contracts import keep_latin, ledger_rows, pending, pick_sample, record_footprint, translated  # noqa: E402

SNAPSHOT = {
    "by_model": [
        {
            "model": "gpt-5.4",
            "call_count": 10,
            "cached_call_count": 4,
            "energy_wh": 2.0,
            "water_ml": 8.0,
            "co2_geq": 0.9,
            "minerals_ugsbeq": 0.01,
            "energy_wh_min": 1.0,
            "energy_wh_max": 3.0,
            "water_ml_min": 6.0,
            "water_ml_max": 10.0,
            "co2_geq_min": 0.5,
            "co2_geq_max": 1.3,
            "minerals_ugsbeq_min": 0.005,
            "minerals_ugsbeq_max": 0.02,
            "source": "measured",
        },
        {"model": "gpt-5.4-mini", "call_count": 3, "cached_call_count": 3, "energy_wh": 0.0, "source": "unavailable"},
    ]
}


def test_pending_takes_each_mongolian_text_once_and_skips_english_and_done():
    texts = ["Ойн газар", "Ойн газар", "Усны газар", "Already in English.", "", "Хог"]
    assert pending(texts, done={"Хог"}) == ["Ойн газар", "Усны газар"]


def test_sample_is_seeded_and_skips_translated():
    texts = [f"гэрээ {i}" for i in range(100)]
    done = {"гэрээ 1", "гэрээ 2"}
    a = pick_sample(texts, done, 10, seed=7)
    assert a == pick_sample(texts, done, 10, seed=7)
    assert len(a) == 10 and not set(a) & done


def test_only_models_with_live_calls_reach_the_ledger():
    assert [r["model"] for r in ledger_rows(SNAPSHOT)] == ["gpt-5.4"]


def test_a_run_leaves_its_measured_footprint_in_the_ledger(tmp_path, monkeypatch):
    monkeypatch.setenv("CPC_LEDGER_DIR", str(tmp_path))
    record_footprint(SNAPSHOT, field="buyer", country="mongolia")
    rows = [json.loads(line) for line in (tmp_path / "footprint-ledger.jsonl").read_text().splitlines()]
    assert len(rows) == 1
    row = rows[0]
    assert row["component"] == "dev_pipeline" and row["country"] == "mongolia"
    assert row["run_id"] == "contracts-translation:buyer" and row["model"] == "gpt-5.4"
    assert (row["call_count"], row["cached_call_count"], row["source"]) == (10, 4, "measured")
    assert (row["co2_geq"], row["co2_geq_min"], row["co2_geq_max"]) == (0.9, 0.5, 1.3)


def test_an_answer_left_in_mongolian_script_is_not_done():
    known = {"Ойн газар": "Forest Agency", "Тариалан": "Tariалан Service Centre"}
    assert translated(known) == {"Ойн газар"}


def test_a_retry_replaces_an_answer_left_in_mongolian_script_or_drops_it():
    first = {"Ойн газар": "Forest Agency", "Тариалан": "Tariалан Centre", "Дөрвөлж": "Dörvöljөө"}
    retry = {"Тариалан": "Tarialan Centre", "Дөрвөлж": "Dörvöljөө"}
    assert keep_latin(first, retry) == {"Ойн газар": "Forest Agency", "Тариалан": "Tarialan Centre"}
