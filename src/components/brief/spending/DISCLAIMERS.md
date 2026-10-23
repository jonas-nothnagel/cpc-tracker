# Disclaimers: the brief's reviewed-spending section

The section's visuals carry no fine print: no status counts, method notes or
"how to read" sentences on the face (Jonas, 23 October 2026: "here people want
to see and learn, not read fine print"). Short AI tags on rows and lines stay
("AI-suggested", "Area checked by a person", "Kept apart until a person
decides").

What the section knows but does not say is kept here, per part of the
section, with the condition it applies to and its wording in the three
languages, in case it has to be shown on demand (a hover, the How it works
page, a printed note). `SpendingSetup.notes` (src/lib/brief/spending.ts) still
names which notes apply to a country.

## Header

**Panama's amounts are balboas** (note `atPar`; Panama's record, currency PAB).
The brief states them as US$: the balboa is at par with the US$.

- en: amounts in balboas, at par with the US$
- es: montos en balboas, a la par con el dólar
- mn: бальбоагаар, ам.доллартай тэнцүү ханштай

**US$ amounts are converted year by year.** Every US$ figure is the review's
amount at each year's exchange rate: Mongolia at the World Bank's official
rate (PA.NUS.FCRF, `python/data/fx-rates.json`), Sri Lanka at the review's own
rates. Amounts summed over the review's per-rate totals (Mongolia's counted
and spent by attribution rate) take the line's own conversion, each year's
rate weighted as the line's spending is. Shares are read in the review's own
currency, so "of every US$100" and "of every ₮100" give the same figure.

- en: {usd} at each year's exchange rate.
- es: {usd} al tipo de cambio de cada año.
- mn: Жил бүрийн ханшаар {usd}.

## Spending by year

**Mongolia's years hold different parts of the budget** (note `levels`): 2020
and 2021 the State and the local budgets, 2022 and 2024 the local budgets
only, 2023 the State budget only. A year total is given for 2020 and 2021
only; a missing part is said in place ("not in the data"), never drawn as
zero. The adapter's own notes are in the record (`record.notes` in
python/data/mongolia-ber.json).

**Panama starts in 2016** (note `panama2015`; decided 23 October 2026). The
Ministry of Environment, created in 2015 out of ANAM, has no budget lines in
the review for 2015; from 2016 it is 42-64% of each year's reviewed spending.

- en: 2015 is not shown: the Ministry of Environment, created that year, has no budget lines in the review for it.
- es: 2015 no se muestra: el Ministerio de Ambiente, creado ese año, no tiene líneas presupuestarias en la revisión para ese año.
- mn: 2015 оныг харуулаагүй: тэр онд байгуулагдсан Байгаль орчны яамны төсвийн мөр тоймд тухайн онд байхгүй.

## What it is for (areas)

**Review status of the areas.** Each line's area is AI-suggested (two models,
step 2) until a person accepts, changes or rejects it in the review sheet
(python/scripts/ber_review_sheet.py); lines the models place differently, or
that no area fits at 0.5, are kept apart. The row tags say this line by line.

- en: {checked, number} of {total, number} lines have an area checked by a person; the others are AI-suggested or kept apart.
- es: {checked, number} de {total, number} líneas tienen un área revisada por una persona; las demás son sugerencias de la IA o están apartadas.
- mn: {total, number} мөрөөс {checked, number}-ийн чиглэлийг хүн шалгасан; бусад нь хиймэл оюуны санал эсвэл тусад нь байна.

**Sri Lanka's areas come from its project lines** (note `projects`). The
headline total is built from agency budgets (LKR 72.8 billion, 2015-2024) and
carries no tags; the areas are read from the review's 106 project lines (LKR
32.3 billion attributed), a second view of the same money. The two are never
added.

- en: The areas are read from the review's {count} project lines, {amount} in {years}, a second view of the same money.
- es: Las áreas se leen en las {count} líneas de proyecto de la revisión, {amount} en {years}, otra vista del mismo dinero.
- mn: Чиглэлүүдийг тоймын {count} төслийн мөрөөс уншсан: {years} онд {amount}, ижил мөнгөний өөр нэг харагдац.

## Reported progress beside reviewed spending (removed for now)

The step that set each national target of the 7th National Report beside the
reviewed spending it meets through a GBF target was taken out of the brief on
23 October 2026, for the next iteration (the official chain stays in
python/output/<country>/ber_chain.json; the step's code is in commit e2bb2d3).
Its footnote:

- en: A budget line counts under every national target it shares a GBF target with, so amounts are not added across targets. {linked, number} of {total, number} lines have a GBF target on which both AI readings of their expenditure type agree; the others are kept apart.
- es: Una línea presupuestaria cuenta en cada meta nacional con la que comparte una meta del GBF, por lo que los montos no se suman entre metas. {linked, number} de {total, number} líneas tienen una meta del GBF en la que coinciden las dos lecturas de la IA de su tipo de gasto; las demás quedan aparte.
- mn: Төсвийн мөр нь GBF зорилт хуваалцдаг үндэсний зорилт бүрт тоологддог тул дүнг зорилтуудын хооронд нэмдэггүй. {total, number} мөрөөс {linked, number} нь зардлын төрлийн хоёр AI уншлагын санал нийлсэн GBF зорилттой; бусад нь тусад нь үлдсэн.
