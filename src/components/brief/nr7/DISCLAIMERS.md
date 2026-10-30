# Disclaimers: the brief's national biodiversity targets

The section's visuals carry no fine print (see the spending section's file for
the rule). What the section knows but does not say is kept here, in case it has
to be shown on demand (a hover, the How it works page, a printed note).

**Where each field comes from** (checked against the CBD exports, 30 October 2026).

- *The report, word for word:* the rating's wording, the GBF targets, the four
  passages, the indicators' names, breakdowns, values, years and units, and the
  questionnaire's questions and answers (the tool's multiple-choice codes spelled
  out word by word, "climateChange" as "Climate change"). Passages match the
  export in Mongolia (80 of 80), Panama (120 of 120, in Spanish) and Sri Lanka (44
  of 64; the other 20 are several report rows joined under their GBF codes).
- *The target's name and wording:* the brief's target list. Mongolia's wording is
  the report's (20 of 20); Sri Lanka's is its NBSAP (15 of 16 at least 98% the
  same as the report); Panama's is its Nature Pledge, where the report has short
  titles. Mongolia's short names ("Protected areas") come from the
  project's `dev_data_scripts/mongolia/Mongolia Targets.xlsx`, sheet "Proposed
  final": they are neither in the report nor headings in the NBSAP.
- *Other reports:* budget-line names and amounts (the country's BER, untouched by
  AI; US$ at the World Bank's annual average rate), reported actions (its BTR).
- *AI:* aligned and potential-misalignment shares and the targets behind them,
  which budget lines and actions read as strongly matching, and the machine
  translations named below. An open row says so over its lists; the table's
  columns do not, as in the brief's other alignment tables.
- *The section's own arithmetic and wording, no AI:* the four short rating labels,
  the counts in a row, the spending total, the sparklines, "x in 2020 to y in
  2025", and "Reported across several targets" (an indicator on four targets or
  more).

**Indicators the export leaves unfiled.** The CSV export names no target for 31 of
Sri Lanka's 47 indicator rows and 108 of Panama's, so those indicators reach no row.
15 of them carry values or a note (Sri Lanka 5, Panama 6, Mongolia 4). The report's
own record does file indicators under each Section III row
(`sectionIII[].indicatorData` from `api/v2013/documents`), and holds 11 of those 15;
the section does not read it yet. So a dash in the Indicators column means none
reached the row, never that the report has none, and the section states nothing
about it. Sri Lanka's NT03, NT04, NT07 and NT10 show neither indicators nor answers.

**The rating is the country's own.** It comes from Section III of the 7th
National Report in the CBD Online Reporting Tool, word for word in the open row.
The six levels of the tool fold onto four labels: "Achieved" counts as on track,
"Not applicable" as unknown. "Behind schedule" in the headline means limited
progress or no progress.

**One self-reported lens.** A rating is a self-assessment, not an audit. Coherence
does not track it: in Mongolia the aligned share of targets rated on track is 77%,
of those rated at an insufficient rate 79%, and in Panama 90% against 88% (30
October 2026). The section makes no claim that coherence drives progress.

**Which target a row reads.** Mongolia's and Sri Lanka's national targets restate
the NBSAP, matched by text. Panama's restate the Nature Pledge in short titles,
matched on shared words in the document's order (`match_in_order`,
`python/src/nr7_ort.py`), so its rows include climate targets. Every other
document is reached only through the AI's readings.

**Sri Lanka files most of Section III under the GBF targets themselves.** Its 22
report rows become 16 national targets through the CBD's own national-target
records. Where a target has several rows the text keeps each row's GBF code and
the rating is the least advanced. 21 of the 22 rows carry the same rating, so the
report's words say more there than the rating does.

**Aligned and potential misalignment** are the AI's readings of the target against
the brief's other documents, as elsewhere in the brief, and follow the documents
selected. Fewer than 30 pairs show no share.

**Budget lines and reported actions are AI readings too** (`high` only). A line
counts under every target it matches, so a row's spending is never added across
rows. Amounts cover the review's complete years: Mongolia 2020-21, Panama
2016-2024, Sri Lanka's project lines 2015-2024. The reviews end before the newest
targets were adopted. A review is biodiversity spending only, and some of it sits
outside what a line can show: Mongolia's review leaves out MNT 20-60 billion a
year of protection and urban-green purpose codes outside its environment
programmes, which bears on its urban green infrastructure target.

**Machine translation.** Panama's report is in Spanish: its English page shows a
machine translation with the report's wording one click away
(`python/data/external/nr7_pan.en.json`). Mongolia's report is in English: its
Mongolian page does the same (`nr7_mng.mn.json`). A passage that is only web
addresses is not translated.

**No sentences on the data.** The section states neither the report's cross-checks
(`detectSignals`, `nr7-self-report.ts`, still on the previous dashboard) nor which
target has the highest share. The project lead's call, 30 October 2026: the data
speaks for itself or can be explored, so that such things become obvious. A share
goes to the target in the ring's centre, and an open row lists the targets behind
it.
