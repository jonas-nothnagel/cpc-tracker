"""Unit tests for parse_panama_ber.py.

Pure-function tests over each pipeline step. No I/O against the real Excel
source — that's exercised by test_panama_ber_integration.py.

Source pivot 2026-06-17: Tablas_adicionales (Magda's preference) replaced
Base de datos FINAL as the canonical source. Tests cover the new
numeric-balance hierarchy reconstruction, name-pattern overhead detection,
and bilingual description carryover.
"""

from __future__ import annotations

import pytest

from src.parse_panama_ber import (
    ALL_YEARS,
    BALANCE_TOLERANCE,
    COLS,
    CURRENCY,
    INSTITUTION_NAME_EN,
    OVERHEAD_NAME_PATTERNS,
    UNIT,
    ProgrammePseudo,
    TablasRow,
    _absorb_subtree,
    _institution_name_en,
    _programme_name_en,
    _render_description,
    _render_description_en,
    _render_description_es,
    _round_money,
    assemble_ber_payload,
    build_overhead_rollup_pseudo,
    build_substantive_pseudo,
    identify_programme_rows,
    is_overhead_name,
    split_into_institution_blocks,
    validate_headers,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def mk_row(institucion: str, line: str, total: float, **kwargs) -> TablasRow:
    """Build a TablasRow with one year's worth of value."""
    return TablasRow(
        row_idx=kwargs.get("row_idx", 0),
        institucion=institucion,
        line=line,
        values={2020: total},
        desc_es=kwargs.get("desc_es", ""),
        desc_en=kwargs.get("desc_en", ""),
        fuente_url=kwargs.get("fuente_url", ""),
    )


# ---------------------------------------------------------------------------
# Header validation
# ---------------------------------------------------------------------------


def test_validate_headers_accepts_canonical_layout():
    header = [""] * 15
    header[0] = "INSTITUCIÓN"
    header[1] = "Institución / Programa / Subprograma / Actividad"
    for offset, year in enumerate(ALL_YEARS):
        header[2 + offset] = str(year)
    header[12] = "Descripción de la línea"
    header[13] = "Description of expenditure line"
    header[14] = "Fuente referencial"
    validate_headers(tuple(header))  # no raise


def test_validate_headers_accepts_int_year_columns():
    """Real-world workbook sometimes emits years as ints, sometimes as strings."""
    header = [""] * 15
    header[0] = "INSTITUCIÓN"
    header[1] = "Institución / Programa / Subprograma / Actividad"
    for offset, year in enumerate(ALL_YEARS):
        header[2 + offset] = year  # int, not str
    header[12] = "Descripción de la línea"
    header[13] = "Description of expenditure line"
    header[14] = "Fuente referencial"
    validate_headers(tuple(header))  # no raise


def test_validate_headers_rejects_drifted_layout():
    header = [""] * 15
    header[0] = "INSTITUCIÓN"
    header[1] = "Institución / Programa / Subprograma / Actividad"
    for offset, year in enumerate(ALL_YEARS):
        header[2 + offset] = str(year)
    header[12] = "Descripción de la línea"
    header[13] = "Description of expenditure line"
    header[14] = "WRONG HEADER"
    with pytest.raises(ValueError, match="Fuente referencial"):
        validate_headers(tuple(header))


def test_validate_headers_rejects_year_drift():
    header = [""] * 15
    header[0] = "INSTITUCIÓN"
    header[1] = "Institución / Programa / Subprograma / Actividad"
    header[2] = "1999"  # wrong year
    for offset, year in enumerate(ALL_YEARS[1:], start=1):
        header[2 + offset] = str(year)
    header[12] = "Descripción de la línea"
    header[13] = "Description of expenditure line"
    header[14] = "Fuente referencial"
    with pytest.raises(ValueError, match="year header 2015"):
        validate_headers(tuple(header))


# ---------------------------------------------------------------------------
# Institution block splitting
# ---------------------------------------------------------------------------


def test_split_blocks_uses_institution_total_marker():
    rows = [
        mk_row("INST_A", "INST_A", 5.0),  # institution total for A
        mk_row("INST_A", "Programme A1", 3.0),
        mk_row("INST_A", "Programme A2", 2.0),
        mk_row("INST_B", "INST_B", 4.0),  # institution total for B
        mk_row("INST_B", "Programme B1", 4.0),
    ]
    blocks = split_into_institution_blocks(rows)
    assert len(blocks) == 2
    assert blocks[0][0].line == "INST_A"
    assert len(blocks[0][1]) == 2
    assert blocks[1][0].line == "INST_B"
    assert len(blocks[1][1]) == 1


def test_split_blocks_drops_orphan_rows_before_first_institution():
    rows = [
        mk_row("Orphan", "Some line", 1.0),  # orphan
        mk_row("INST_A", "INST_A", 5.0),
        mk_row("INST_A", "Programme A1", 5.0),
    ]
    blocks = split_into_institution_blocks(rows)
    assert len(blocks) == 1


# ---------------------------------------------------------------------------
# Numeric-balance hierarchy
# ---------------------------------------------------------------------------


def test_absorb_subtree_returns_empty_for_leaf_at_end():
    absorbed, j = _absorb_subtree([], 0, 1.0)
    assert absorbed == []
    assert j == 0


def test_absorb_subtree_balances_single_child():
    children = [
        mk_row("X", "Sub", 1.0),
        mk_row("X", "Activity", 1.0),
    ]
    absorbed, j = _absorb_subtree(children, 0, 1.0)
    # Both rows absorbed (Sub as direct child, Activity as descendant of Sub).
    assert len(absorbed) == 2
    assert j == 2


def test_absorb_subtree_stops_at_overshoot():
    children = [
        mk_row("X", "Subprogramme A", 1.0),
        mk_row("X", "Activity A1", 1.0),
        mk_row("X", "Sibling-overshoot", 5.0),  # would overshoot parent 1.0
    ]
    absorbed, j = _absorb_subtree(children, 0, 1.0)
    assert len(absorbed) == 2  # A + A1, not Sibling-overshoot
    assert j == 2


def test_identify_programme_rows_trivial_chain():
    """Real example: AAC has a single programme with single subprogramme,
    single activity. All values equal."""
    inst = mk_row("AAC", "AAC", 0.5)
    children = [
        mk_row("AAC", "Programme", 0.5),
        mk_row("AAC", "Subprogramme", 0.5),
        mk_row("AAC", "Activity", 0.5),
    ]
    programmes = identify_programme_rows(inst, children)
    assert len(programmes) == 1
    programme, drill_down = programmes[0]
    assert programme.line == "Programme"
    assert len(drill_down) == 2  # Subprogramme + Activity


def test_identify_programme_rows_multiple_programmes():
    """Real example: institution with two programmes that sum to inst total.
    Each programme has branching children — numeric balance walks cleanly."""
    inst = mk_row("X", "X", 5.0)
    children = [
        mk_row("X", "Programme A", 3.0),
        mk_row("X", "Sub A1", 2.0),
        mk_row("X", "Activity A1.1", 2.0),
        mk_row("X", "Sub A2", 1.0),
        mk_row("X", "Activity A2.1", 1.0),
        mk_row("X", "Programme B", 2.0),
        mk_row("X", "Sub B1", 2.0),
    ]
    programmes = identify_programme_rows(inst, children)
    assert len(programmes) == 2
    assert programmes[0][0].line == "Programme A"
    assert programmes[1][0].line == "Programme B"
    assert len(programmes[0][1]) == 4
    assert len(programmes[1][1]) == 1


def test_identify_programme_rows_empty_children():
    inst = mk_row("X", "X", 0.0)
    assert identify_programme_rows(inst, []) == []


# ---------------------------------------------------------------------------
# Overhead name detection (Decision 3)
# ---------------------------------------------------------------------------


def test_is_overhead_name_matches_seed_patterns():
    assert is_overhead_name("Dirección y Administración General")
    assert is_overhead_name("Dirección Superior")
    assert is_overhead_name("Despacho Superior")
    assert is_overhead_name("Servicios Administrativos")
    assert is_overhead_name("Administración General")


def test_is_overhead_name_is_case_insensitive():
    assert is_overhead_name("DIRECCIÓN Y ADMINISTRACIÓN GENERAL")
    assert is_overhead_name("dirección superior")


def test_is_overhead_name_does_not_false_positive_on_administrativo_in_name():
    """A substantive programme with 'Administración' in the name (not as
    standalone overhead) should NOT be flagged."""
    # These contain "administración" but it's part of a substantive context.
    # Our stoplist is targeted at exact phrases, so e.g. "Administración de
    # Áreas Protegidas" won't false-positive because none of the patterns
    # match that substring.
    assert not is_overhead_name("Administración de Áreas Protegidas")
    assert not is_overhead_name("Investigación Agropecuaria")
    assert not is_overhead_name("Conservación de la Biodiversidad")


def test_overhead_pattern_list_is_finite():
    """Guardrail: overhead patterns are a deliberate stoplist, not LLM-derived.
    Keep small and reviewable."""
    assert len(OVERHEAD_NAME_PATTERNS) <= 12


# ---------------------------------------------------------------------------
# Pseudo-target construction
# ---------------------------------------------------------------------------


def test_build_substantive_pseudo_carries_bilingual_descriptions():
    programme = mk_row(
        "MIAMBIENTE", "Áreas Protegidas y Biodiversidad", 3.0,
        desc_es="Línea vinculada a la conservación.",
        desc_en="Line linked to conservation.",
        fuente_url="https://miambiente.gob.pa/",
    )
    p = build_substantive_pseudo(7, 1, "MINISTERIO DE AMBIENTE", programme, [])
    assert p.programme_name == "Áreas Protegidas y Biodiversidad"
    assert p.desc_es == "Línea vinculada a la conservación."
    assert p.desc_en == "Line linked to conservation."
    assert p.fuente_url == "https://miambiente.gob.pa/"
    assert p.institution_idx == 7
    assert p.programme_idx == 1
    assert p.is_overhead is False
    assert p.derived_from_row_count == 1


def test_build_overhead_rollup_combines_programmes():
    overhead_a = mk_row(
        "X", "Dirección Superior", 2.0,
        desc_en="Direction line.", fuente_url="https://x.gob.pa/dir",
    )
    overhead_b = mk_row(
        "X", "Servicios Administrativos", 1.0,
        desc_en="Admin services.", fuente_url="https://x.gob.pa/admin",
    )
    p = build_overhead_rollup_pseudo(
        7, "MINISTERIO DE AMBIENTE",
        [(overhead_a, []), (overhead_b, [])],
    )
    assert p.is_overhead is True
    assert p.programme_idx == 0
    assert "Apoyo institucional" in p.programme_name
    # Combined values per year.
    assert p.values[2020] == 3.0
    # URLs concatenated.
    assert "https://x.gob.pa/dir" in p.fuente_url
    assert "https://x.gob.pa/admin" in p.fuente_url


# ---------------------------------------------------------------------------
# Description rendering — guardrail (CLAUDE.md) on LLM-source attribution
# ---------------------------------------------------------------------------


def test_render_description_includes_tablas_source_label():
    """Guardrail: the pseudo-target text MUST disclose that descriptions are
    LLM-generated and sourced from Tablas. Defends against silent description
    polishing or source-substitution downstream."""
    p = ProgrammePseudo(
        institution_idx=7,
        programme_idx=1,
        institution_name="MINISTERIO DE AMBIENTE",
        programme_name="Áreas Protegidas",
        values={y: 0.5 for y in ALL_YEARS},
        desc_es="ES desc",
        desc_en="EN desc",
        fuente_url="https://miambiente.gob.pa/",
        derived_from_row_count=2,
        is_overhead=False,
    )
    text = _render_description(p)
    assert "Tablas_adicionales descriptive layer" in text
    assert "LLM-generated" in text
    assert "Panama BIOFIN team preferred" in text


def test_render_description_substantive_includes_english_description():
    p = ProgrammePseudo(
        institution_idx=7, programme_idx=1,
        institution_name="MIAMBIENTE", programme_name="Áreas Protegidas",
        values={2020: 5.0}, desc_es="ES desc",
        desc_en="Line linked to biodiversity conservation.",
        fuente_url="", derived_from_row_count=1, is_overhead=False,
    )
    text = _render_description(p)
    assert "Line linked to biodiversity conservation." in text


def test_render_description_overhead_uses_rollup_framing():
    p = ProgrammePseudo(
        institution_idx=7, programme_idx=0,
        institution_name="MIAMBIENTE", programme_name="Apoyo — MIAMBIENTE",
        values={2020: 5.0}, desc_es="", desc_en="Institutional direction.",
        fuente_url="", derived_from_row_count=3, is_overhead=True,
    )
    text = _render_description(p)
    assert "Cross-cutting institutional support" in text
    assert "Institutional direction." in text


def test_render_description_falls_back_to_spanish_when_english_missing():
    p = ProgrammePseudo(
        institution_idx=7, programme_idx=1,
        institution_name="MIAMBIENTE", programme_name="Áreas Protegidas",
        values={2020: 5.0}, desc_es="Línea vinculada a la conservación.",
        desc_en="", fuente_url="", derived_from_row_count=1, is_overhead=False,
    )
    text = _render_description(p)
    assert "Línea vinculada a la conservación." in text


def test_render_description_handles_missing_descriptions():
    p = ProgrammePseudo(
        institution_idx=7, programme_idx=1,
        institution_name="MIAMBIENTE", programme_name="Áreas Protegidas",
        values={2020: 5.0}, desc_es="", desc_en="",
        fuente_url="", derived_from_row_count=1, is_overhead=False,
    )
    text = _render_description(p)
    assert "(no description available)" in text


# ---------------------------------------------------------------------------
# Payload assembly (Mongolia shape)
# ---------------------------------------------------------------------------


def test_assemble_ber_payload_matches_mongolia_shape():
    p = ProgrammePseudo(
        institution_idx=1, programme_idx=1,
        institution_name="X", programme_name="Y",
        values={y: 1.0 for y in ALL_YEARS}, desc_es="", desc_en="EN",
        fuente_url="", derived_from_row_count=1, is_overhead=False,
    )
    payload = assemble_ber_payload([p])
    assert set(payload.keys()) == {"programs", "expenditure", "currency", "unit", "period"}
    assert payload["currency"] == CURRENCY == "PAB"
    assert payload["unit"] == UNIT == "million"
    assert payload["period"] == {"start": 2015, "end": 2024}
    assert payload["programs"][0]["code"] == "BER_PA_01_01"
    assert payload["programs"][0]["type"] == "environmental"
    assert payload["expenditure"][0]["values"]["2020"] == 1.0


def test_assemble_ber_payload_codes_overhead_with_OVERHEAD_suffix():
    p = ProgrammePseudo(
        institution_idx=7, programme_idx=0,
        institution_name="X", programme_name="Apoyo X",
        values={2020: 1.0}, desc_es="", desc_en="",
        fuente_url="", derived_from_row_count=1, is_overhead=True,
    )
    payload = assemble_ber_payload([p])
    assert payload["programs"][0]["code"] == "BER_PA_07_OVERHEAD"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def test_round_money_rounds_to_4_decimal_places():
    assert _round_money(1.234567) == 1.2346
    assert _round_money(0.0) == 0.0


def test_balance_tolerance_is_small_but_loose_enough_for_rounding():
    """Tolerance shape sanity check — should be smaller than typical M PAB
    values (so it catches real drift) but big enough to absorb 4-decimal
    rounding (so identical sums don't mismatch)."""
    assert 0 < BALANCE_TOLERANCE < 0.1


# ---------------------------------------------------------------------------
# Bilingual display fields (Option A/B/C: i18n-able name + descriptions).
# Descriptions and labels are hand-curated EN/ES; no LLM translation, no
# silent rename of the LLM-input `description` field (cache-stable).
# ---------------------------------------------------------------------------


def test_institution_name_en_uses_curated_lookup():
    assert _institution_name_en("MINISTERIO DE AMBIENTE") == "Ministry of Environment"
    assert _institution_name_en("AUTORIDAD AERONÁUTICA CIVIL") == "Civil Aviation Authority"


def test_institution_name_en_falls_back_to_title_case_for_unknown():
    """Defensive: if a new institution appears that isn't in the lookup,
    fall back to title-cased Spanish so the EN page doesn't show SHOUTY caps."""
    out = _institution_name_en("MINISTERIO DE COSAS INVENTADAS")
    assert out == "Ministerio De Cosas Inventadas"


def test_institution_name_en_covers_all_known_panama_institutions():
    """Smoke check: lookup must cover the institutions visible in current
    Panama BER data. New institution in the source → this fails and prompts
    a curated translation."""
    assert "MINISTERIO DE AMBIENTE" in INSTITUTION_NAME_EN
    assert len(INSTITUTION_NAME_EN) >= 13


def test_programme_name_en_keeps_substantive_spanish_proper_noun():
    """Substantive programme names are MEF budget vocabulary — Spanish only.
    Translating loses the link to source budget documents."""
    p = ProgrammePseudo(
        institution_idx=1, programme_idx=1,
        institution_name="MINISTERIO DE AMBIENTE",
        programme_name="Sanidad Agropecuaria",
        values={2020: 1.0}, desc_es="", desc_en="",
        fuente_url="", derived_from_row_count=1, is_overhead=False,
    )
    assert _programme_name_en(p) == "Sanidad Agropecuaria"


def test_programme_name_en_rewrites_overhead_with_english_prefix_and_institution():
    p = ProgrammePseudo(
        institution_idx=3, programme_idx=0,
        institution_name="MINISTERIO DE AMBIENTE",
        programme_name="Apoyo institucional — Ministerio De Ambiente",
        values={2020: 1.0}, desc_es="", desc_en="",
        fuente_url="", derived_from_row_count=1, is_overhead=True,
    )
    assert _programme_name_en(p) == "Institutional support — Ministry of Environment"


def test_render_description_en_uses_curated_english_institution_name():
    p = ProgrammePseudo(
        institution_idx=1, programme_idx=1,
        institution_name="MINISTERIO DE AMBIENTE", programme_name="Áreas Protegidas",
        values={2020: 1.0}, desc_es="ES", desc_en="EN body",
        fuente_url="", derived_from_row_count=1, is_overhead=False,
    )
    text = _render_description_en(p)
    assert "Ministry of Environment" in text
    assert "MINISTERIO DE AMBIENTE" not in text
    assert "EN body" in text


def test_render_description_es_uses_spanish_institution_name():
    p = ProgrammePseudo(
        institution_idx=1, programme_idx=1,
        institution_name="MINISTERIO DE AMBIENTE", programme_name="Áreas Protegidas",
        values={2020: 1.0}, desc_es="ES body", desc_en="EN",
        fuente_url="", derived_from_row_count=1, is_overhead=False,
    )
    text = _render_description_es(p)
    assert "Ministerio De Ambiente" in text
    assert "Ministry of Environment" not in text
    assert "ES body" in text


def test_assemble_ber_payload_emits_bilingual_fields_on_every_programme():
    substantive = ProgrammePseudo(
        institution_idx=1, programme_idx=1,
        institution_name="MINISTERIO DE AMBIENTE", programme_name="Sanidad",
        values={2020: 1.0}, desc_es="ES", desc_en="EN",
        fuente_url="", derived_from_row_count=1, is_overhead=False,
    )
    overhead = ProgrammePseudo(
        institution_idx=2, programme_idx=0,
        institution_name="MINISTERIO DE SALUD",
        programme_name="Apoyo institucional — Ministerio De Salud",
        values={2020: 1.0}, desc_es="ES", desc_en="EN",
        fuente_url="", derived_from_row_count=1, is_overhead=True,
    )
    payload = assemble_ber_payload([substantive, overhead])
    for prog, exp in zip(payload["programs"], payload["expenditure"]):
        assert "nameEn" in prog and prog["nameEn"]
        assert "descriptionEs" in prog and prog["descriptionEs"]
        assert "descriptionEn" in prog and prog["descriptionEn"]
        assert "nameEn" in exp and exp["nameEn"]
    # Overhead nameEn must be the curated English label, not the Spanish one
    assert payload["programs"][1]["nameEn"] == "Institutional support — Ministry of Health"
    # Spanish `name` field stays unchanged (legacy contract)
    assert payload["programs"][1]["name"].startswith("Apoyo institucional")


def test_assemble_ber_payload_preserves_legacy_description_field_for_cache_stability():
    """budget_alignment caches on the `description` field. Adding bilingual
    fields must not change `description` content for the same programme."""
    p = ProgrammePseudo(
        institution_idx=1, programme_idx=1,
        institution_name="MINISTERIO DE AMBIENTE", programme_name="Sanidad",
        values={2020: 1.0}, desc_es="ES body", desc_en="EN body",
        fuente_url="", derived_from_row_count=1, is_overhead=False,
    )
    payload = assemble_ber_payload([p])
    legacy = payload["programs"][0]["description"]
    assert legacy == _render_description(p)
    # Sanity: legacy still uses the Spanish institution name (LLM-input form).
    assert "MINISTERIO DE AMBIENTE" in legacy
