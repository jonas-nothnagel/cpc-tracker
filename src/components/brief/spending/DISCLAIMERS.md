# Disclaimers: the brief's reviewed-spending section

The section's visuals carry no fine print: no status counts, method notes or
"how to read" sentences on the face (Jonas, 23 October 2026: "here people want
to see and learn, not read fine print"). Short AI tags on rows and lines stay
("AI-suggested", "Area checked by a person", "No specific area").

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

**The review's own currency appears only on the country's own-language page**
(Jonas, 23 October 2026: "use US$ as default always. Forever. Local currency
only in local language setting"). Every other page states amounts in US$ alone,
with no switch; the Mongolian page opens in tugrik with a switch to US$
(`localCurrency` from the route, src/app/[locale]/[country]/brief/page.tsx).
The language links never carry the currency (`cur`) across.

## Names of the review's lines

**Machine-translated names** (`translated: true` on a line, programme,
activity or, for Panama, institution, src/lib/brief/spending.ts; Panama's 14
institution names and one programme name were translated on 27 October 2026,
the rest on 23 October, as `_meta.runs` in python/data/panama-ber-names.json
records). A name shows in
the page's language
from python/data/<country>-ber-names.json (`shownName` in
src/lib/brief/ber-names-shared.ts): in Spanish with the review's
abbreviations written out; in Mongolian as the review has it, else machine
translated (`mnMachine`); in English always the machine translation
(Panama's from the review's Spanish, `build_ber_names.TRANSLATE_SYSTEM`).
The review's own name stays in `original` and shows on hover over the name.
The tag beside every translated name came off the face on 23 October 2026
(Jonas: "we dont have to show it every single time"). Its wording:

- en: machine translation
- es: traducción automática
- mn: машин орчуулга

**Panama's programmes are named as the database names them in the latest
year** with money in the review (python/scripts/build_ber_panama.py); the
earlier names stay in the record (`formerNames`). Four of the Ministry of
Environment's programmes were renamed after 2016, and three of its programme
names now come twice, once in each budget. Where an institution runs two
programmes of one name, the list adds the budget to the name ("investment
budget", "operating budget"; the database's INVERSION and FUNCIONAMIENTO).

**A row of the review's lines opens only where the review says more about
it** (since 18 November 2026; `itemOpens` in src/lib/brief/spending.ts): a
rate other than 100%, the review's reason, its rates, who spends it, what it
pays for, or its parts. Every other row is plain, with no pointer and nothing
to expand: in Sri Lanka 9 of the 10 agencies counted in full (Sri Lanka
Customs keeps its row, for the review's reason), and every line of Country X.
The list shows its 6 largest rows, the rest on request.

**Mongolia's budget holders** (the institution view of its list) are named as
the review's workbook names them (sheet 2016-2021, column Admin1, its leading
code kept apart): its own English on the English page, its own Mongolian on
the Mongolian page. No name is translated. They cover 2020 and 2021, the years
with every budget in the data; in each year their amounts add up to each
line's counted amount (python/scripts/build_ber_mongolia.py checks it).

## Spending by year

**Mongolia's years hold different parts of the budget** (note `levels`): 2020
and 2021 the State and the local budgets, 2022 and 2024 the local budgets
only, 2023 the State budget only. A year total is given for 2020 and 2021
only; a missing part is said in place ("not in the data"), never drawn as
zero. The adapter's own notes are in the record (`record.notes` in
python/data/mongolia-ber.json).

**Sri Lanka's two parts follow the rows' rule** (since 18 November 2026). An
agency is counted in full when every rate the review applies to it is 100%,
whatever its group; with no rate stated, by its group (CBA and DBU in full,
OASBE and OAMBE in part, `GROUP_SERIES`). The year chart used to
split by the review's group alone, so Sri Lanka Customs' biodiversity
division (group OASBE, 100% in every year) stood under the agencies counted
in part while its row said "Counted in full". Each year's total is the
review's; only the split between the two parts moves
(`countedInFull` in src/lib/brief/spending.ts).

**Panama starts in 2016** (note `panama2015`; decided 23 October 2026). The
Ministry of Environment, created in 2015 out of ANAM, has no budget lines in
the review for 2015; from 2016 it is 42-64% of each year's reviewed spending.

- en: 2015 is not shown: the Ministry of Environment, created that year, has no budget lines in the review for it.
- es: 2015 no se muestra: el Ministerio de Ambiente, creado ese año, no tiene líneas presupuestarias en la revisión para ese año.
- mn: 2015 оныг харуулаагүй: тэр онд байгуулагдсан Байгаль орчны яамны төсвийн мөр тоймд тухайн онд байхгүй.

**The documents by when they came out** (20 November 2026, for the
biodiversity finance expert's ask of 8 October 2026: whether the spending
came before or after a policy came out). Under the chart of the years, the
brief's documents in one line each: from before the charted years, during
them, after them, and without a date. The date is `publishedOn`
(python/data/<country>-country-config.json), entered by hand from the
free-text `published` beside it and held to it by `pnpm check:configs`.
Nothing is drawn on the bars: yearly spending cannot show what a document
did, and every mark tried on the chart read as a link between a document
and that year's spending (Jonas, 19 and 20 November 2026: names under the
years, a separate block per document, codes with dashed drops and a click
that re-inked the bars, a thin line at each date). What the lines do not
say:

- A document "from 2020-2024" came out during the charted years; the lines
  do not say which of that spending came after it.
- A date is the one the config states, which is not always a publication:
  Panama's PNSH (2016) and PNRF (May 2021) are dates of adoption.
- Where the config gives a year alone, the month is not known (Panama's ENR,
  PIOTA, HR; Sri Lanka's NEnvP, NWRP, NPWM, NWP; Côte d'Ivoire's LDN).
- A document whose config states only the period it covers (Panama's PENCYT,
  "2025-2029") or no date at all is among those without a date.

## What it is for (areas)

**Review status of the areas.** Each line's area is AI-suggested (step 2)
until a person accepts, changes or rejects it in the review sheet
(python/scripts/ber_review_sheet.py). Claude Opus decides (Jonas, 29 October
2026): a line takes Opus's area at a score of 0.5 or more; below it the line is
general biodiversity spending with no specific area, still counted in every
total (the review's call that it is biodiversity spending stands). GPT-5.4's
reading is a second opinion that orders the review sheet. The row tags say this
line by line ("Area reviewed", "AI-suggested, not yet reviewed", "No specific
area"); the leftover row is named "General biodiversity spending, no specific
area" in Biodiversity, and after the lens in a climate lens (below). A
reviewer may change or reject an area, so the tags say "reviewed",
never "confirmed" (copy.test.ts). The step-wide tag beside the title
("AI-suggested" / "Sugerido por IA" / "Хиймэл оюуны санал") came off on
23 October 2026 (Jonas: "remove AI suggested"); the row tags carry it.

- en: {checked, number} of {total, number} lines have an area checked by a person; the others are AI-suggested or have no specific area.
- es: {checked, number} de {total, number} líneas tienen un área revisada por una persona; las demás son sugerencias de la IA o no tienen un área específica.
- mn: {total, number} мөрөөс {checked, number}-ийн чиглэлийг хүн шалгасан; бусад нь хиймэл оюуны санал эсвэл тодорхой чиглэлгүй.

**The climate lenses** (since 18 November 2026). The lines are placed in
climate mitigation (the IPCC sectors; Mongolia, Panama, Sri Lanka) and climate
adaptation (the GGA in Mongolia and Panama; Sri Lanka's own adaptation sectors
there) by the rule above, and every placement is AI-suggested until a person
checks it (one review sheet per lens). The section reads the areas in the
brief's lens where the lines are placed in it, else in Biodiversity; the
choice of lens shows only where they are placed in more than one, and it moves
the brief's lens with it, as in the thematic areas. The review counts
biodiversity spending only: under a climate lens an area without a line has no
reviewed biodiversity spending, which says nothing of its climate spending, and
a line with no area of the lens is still biodiversity spending, counted in every
total under the leftover row, which names the lens (since 19 November 2026):
"Biodiversity spending with no climate mitigation area" (or "climate
adaptation area"), each of its lines tagged "No climate mitigation area" (or
adaptation). Money left with no specific area in the run
of 18 November 2026: climate mitigation 14% in Mongolia (and the project-defined
catch-all "Other / Cross-cutting" a further 53%), 62% in Panama, 29% in Sri
Lanka; climate adaptation 61% in Mongolia, 23% in Panama, 1% in Sri Lanka.

- en: Under a climate lens, an area without a budget line has no reviewed biodiversity spending; its climate spending is not in the review.
- es: Con una perspectiva climática, un área sin línea presupuestaria no tiene gasto revisado en biodiversidad; su gasto climático no está en la revisión.
- mn: Уур амьсгалын харагдацаар төсвийн мөргүй чиглэлд хянасан биологийн олон янз байдлын зарцуулалт байхгүй гэсэн үг; түүний уур амьсгалын зарцуулалт тоймд ороогүй.

**The targets' shares are read over the targets placed in an area of the
lens** (since 19 November 2026), as the thematic areas read them, so the same
areas hold the same share in both sections; the sentence states that count ("of
the 99 targets"). A target with no area in the lens counts in neither section;
the thematic areas say how many have one, in the brief's `areaView.scope`
wording:

- en: {placed, number} of the {total, number} targets fall in one of these areas.
- es: {placed, number} de las {total, number} metas se encuentran en una de estas áreas.
- mn: {total, number} зорилтын {placed, number} нь эдгээр чиглэлийн аль нэгэнд хамаарна.

**The review's own words on a Panama line.** An opened line in an area shows
the review's tag (Directo / Indirecto, per year in the record) and BIOFIN
Panama's description of the line, written for this tool in Spanish and English
(Tablas_adicionales_desagregacion_descripciones, sheet Desagregación_descrita;
python/scripts/build_ber_panama.py matches them to the lines). Most are short
templates (26 English texts for 264 lines). No AI touches them; they show
behind the line's name, not on the face.

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
