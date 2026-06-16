"""Regenerate the panama-ber fixture .xlsx from a Python definition.

Run this script when you intentionally change the fixture shape. The .xlsx
is committed so test runs don't depend on this script. Keep the fixture
small and well-commented; it's the contract document for the ingest pipeline.

Source format: Tablas_adicionales_desagregacion_descripciones (1).xlsx,
sheet `Desagregación_descrita`. Layout:
  R0 = title row (ignored by ingest)
  R1 = headers
  R2+ = data rows, with institution-total rows marked by col 0 == col 1,
        and the hierarchy encoded via numeric balance (parent.value =
        sum of children's values).

Usage:
    python tests/fixtures/build_panama_ber_fixture.py
"""

from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook

HEADER_NAMES = [
    "INSTITUCIÓN",
    "Institución / Programa / Subprograma / Actividad",
    "2015", "2016", "2017", "2018", "2019",
    "2020", "2021", "2022", "2023", "2024",
    "Descripción de la línea",
    "Description of expenditure line",
    "Fuente referencial",
]


def row(institucion: str, line: str, values_by_year: dict[int, float],
        desc_es: str = "", desc_en: str = "", fuente_url: str = ""):
    """Build a row in Desagregación_descrita's column order."""
    return [
        institucion,
        line,
        values_by_year.get(2015, 0.0), values_by_year.get(2016, 0.0),
        values_by_year.get(2017, 0.0), values_by_year.get(2018, 0.0),
        values_by_year.get(2019, 0.0), values_by_year.get(2020, 0.0),
        values_by_year.get(2021, 0.0), values_by_year.get(2022, 0.0),
        values_by_year.get(2023, 0.0), values_by_year.get(2024, 0.0),
        desc_es,
        desc_en,
        fuente_url,
    ]


# Fixture data — three institutions, covering substantive + overhead
# programmes and the numeric-balance hierarchy.
#
# INSTITUTION 1 — TRIVIAL CHAIN: institution total = single programme = single subprogramme = single activity.
#   Real example: AUTORIDAD AERONÁUTICA CIVIL. Tests that flat chains are
#   correctly resolved to one programme with two drill-down rows.
#
# INSTITUTION 2 — MULTI-PROGRAMME WITH NESTED CHILDREN: tests recursive
# subtree absorption and overshoot detection.
#   Programme A (value 3.0)
#     Subprogramme A1 (value 1.0) → Activity A1.1 (value 1.0)
#     Subprogramme A2 (value 2.0) → Activity A2.1 (value 1.2), Activity A2.2 (value 0.8)
#   Programme B (value 4.0)
#     Subprogramme B1 (value 4.0) → Activity B1.1 (value 4.0)
#   Institution total = 7.0.
#
# INSTITUTION 3 — OVERHEAD ROLLUP: one substantive + one overhead programme.
#   "Dirección Superior" matches the overhead pattern; gets rolled up into
#   an institutional Apoyo rollup. Substantive programme is emitted directly.
TITLE_ROW = ["Gasto público en biodiversidad por entidad, programa, subprograma y actividad-  según presupuesto ejecutado– Años 2015-2024 fixture"] + [""] * 14

FIXTURE_ROWS = [
    TITLE_ROW,
    HEADER_NAMES,

    # --- INSTITUTION 1: AAC — trivial chain ---
    row("AUTORIDAD AERONÁUTICA CIVIL", "AUTORIDAD AERONÁUTICA CIVIL",
        {2020: 0.5, 2021: 0.5, 2022: 0.5}),  # institution total
    row("AUTORIDAD AERONÁUTICA CIVIL", "Rehabil. y Mantenim. Aeroportuario",
        {2020: 0.5, 2021: 0.5, 2022: 0.5},
        desc_es="Línea asociada a gestión aeroportuaria.",
        desc_en="Line associated with airport management.",
        fuente_url="https://www.aeronautica.gob.pa/"),  # only programme
    row("AUTORIDAD AERONÁUTICA CIVIL", "OTRAS HABILITACIONES",
        {2020: 0.5, 2021: 0.5, 2022: 0.5}),  # subprogramme
    row("AUTORIDAD AERONÁUTICA CIVIL", "Conservación de Áreas Verdes",
        {2020: 0.5, 2021: 0.5, 2022: 0.5}),  # activity

    # --- INSTITUTION 2: ARAP — multi-programme nested ---
    row("AUTORIDAD DE LOS RECURSOS ACUÁTICOS DE PANAMÁ", "AUTORIDAD DE LOS RECURSOS ACUÁTICOS DE PANAMÁ",
        {2020: 7.0}),  # inst total
    row("AUTORIDAD DE LOS RECURSOS ACUÁTICOS DE PANAMÁ", "Admón. de los Recursos Acuáticos",
        {2020: 3.0},
        desc_es="Línea vinculada a la administración de recursos acuáticos.",
        desc_en="Line linked to administration of aquatic resources.",
        fuente_url="https://arap.gob.pa/"),  # programme A
    row("AUTORIDAD DE LOS RECURSOS ACUÁTICOS DE PANAMÁ", "Dirección de Operaciones",
        {2020: 1.0}),  # subprogramme A1
    row("AUTORIDAD DE LOS RECURSOS ACUÁTICOS DE PANAMÁ", "Operaciones Centrales",
        {2020: 1.0}),  # activity A1.1
    row("AUTORIDAD DE LOS RECURSOS ACUÁTICOS DE PANAMÁ", "Servicios Regionales",
        {2020: 2.0}),  # subprogramme A2
    row("AUTORIDAD DE LOS RECURSOS ACUÁTICOS DE PANAMÁ", "Región Caribe",
        {2020: 1.2}),  # activity A2.1
    row("AUTORIDAD DE LOS RECURSOS ACUÁTICOS DE PANAMÁ", "Región Pacífico",
        {2020: 0.8}),  # activity A2.2
    row("AUTORIDAD DE LOS RECURSOS ACUÁTICOS DE PANAMÁ", "Desarr. y Conserv. Rec. Acuáticos",
        {2020: 4.0},
        desc_es="Línea vinculada al desarrollo y conservación de recursos acuáticos.",
        desc_en="Line linked to development and conservation of aquatic resources.",
        fuente_url="https://arap.gob.pa/conservacion"),  # programme B
    row("AUTORIDAD DE LOS RECURSOS ACUÁTICOS DE PANAMÁ", "Programa de Restauración",
        {2020: 4.0}),  # subprogramme B1
    row("AUTORIDAD DE LOS RECURSOS ACUÁTICOS DE PANAMÁ", "Restauración Costera",
        {2020: 4.0}),  # activity B1.1

    # --- INSTITUTION 3: MIAMBIENTE — substantive + overhead rollup ---
    # Substantive programme has BRANCHING children (Conservación 2.0 +
    # Investigación 1.0 = 3.0). Branching forces the recursive descent to
    # balance exactly at the programme value, preventing it from absorbing
    # the next sibling programme (Dirección Superior).
    row("MINISTERIO DE AMBIENTE", "MINISTERIO DE AMBIENTE",
        {2020: 5.0}),  # inst total
    row("MINISTERIO DE AMBIENTE", "Áreas Protegidas y Biodiversidad",
        {2020: 3.0},
        desc_es="Línea vinculada a la conservación de la biodiversidad.",
        desc_en="Line linked to biodiversity conservation.",
        fuente_url="https://miambiente.gob.pa/"),  # substantive programme (3.0)
    row("MINISTERIO DE AMBIENTE", "Conservación de Especies",
        {2020: 2.0}),  # subprogramme A (2.0)
    row("MINISTERIO DE AMBIENTE", "Manejo de Áreas Protegidas",
        {2020: 2.0}),  # activity under Conservación (2.0)
    row("MINISTERIO DE AMBIENTE", "Investigación",
        {2020: 1.0}),  # subprogramme B (1.0)
    row("MINISTERIO DE AMBIENTE", "Estudios",
        {2020: 1.0}),  # activity under Investigación (1.0)
    row("MINISTERIO DE AMBIENTE", "Dirección Superior",
        {2020: 2.0},
        desc_es="Línea de dirección institucional.",
        desc_en="Institutional direction line.",
        fuente_url="https://miambiente.gob.pa/admin"),  # overhead programme (matches pattern, 2.0)
    row("MINISTERIO DE AMBIENTE", "Despacho Ministerial",
        {2020: 2.0}),  # activity under Dirección (2.0)
]


def main():
    wb = Workbook()
    ws = wb.active
    ws.title = "Desagregación_descrita"
    for r in FIXTURE_ROWS:
        ws.append(r)

    out_path = Path(__file__).parent / "panama-ber-fixture.xlsx"
    wb.save(out_path)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
