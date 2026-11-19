# Disclaimers: the Explore ring

What the ring knows but does not say on its face, kept here in case it has to
be shown on demand (a hover, the How it works page, a printed note), as for
the reviewed-spending section (../spending/DISCLAIMERS.md).

## The item in focus

**Machine-translated names and descriptions** (`translated: "machine"` and
`textTranslated: "machine"` on a ring item, src/lib/brief/explore/layers.ts).
A budget line's name in the page's language may be a machine translation
(python/data/<country>-ber-names.json), and so are a reported action's title
and text in a language the report does not give (the `labels` passed to
`buildExploreLayers`). On the Mongolian page a line's description may be the
machine translation of the review's English. The source's own name shows on
hover over the title ("In the review: …", "In the report: …"). The tag beside
a translated name or before a translated description came off the face on
23 October 2026 (Jonas: "we dont have to show it every single time"). Its
wording:

- en: machine translation
- es: traducción automática
- mn: машин орчуулга

**A target's rating in its country's 7th National Report** (since 18 November
2026; `RatingTag` in src/components/brief/rating-tag.tsx) is tagged under the
target's document name in the side column, in the centre's card and on a dot's
hover card: "7th National Report: Limited progress", a mark and a word in ink.
Where two national targets of the report map to one NBSAP target, the target
shows the less advanced rating (`NR7_RANK` in src/lib/brief/explore/layers.ts).
The tag needs no reported action or budget line: the ratings travel with the
explorer's layers even where a country has neither.
