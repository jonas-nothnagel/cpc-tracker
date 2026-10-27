# Disclaimers: the public contracts page

What the page knows but does not say on its face, kept here in case it has to
be shown on demand (a hover, the How it works page, a printed note), as for
the reviewed-spending section (../spending/DISCLAIMERS.md).

## Amounts

**US$ at one indicative rate** (`source.usdRate` in the contracts file, ₮3,500
per US$). Every page but the Mongolian one states amounts in US$ alone (Jonas,
23 October 2026: "use US$ as default always. Forever. Local currency only in
local language setting"), converted at this one rate for every year, so early
years read lower than at their own year's rate. The Mongolian page opens in
tugrik; there the switch to US$ shows the rate beside it, and a headline amount
carries its twin in the other currency. Neither shows elsewhere. Their wording:

- rate, en: At ₮{rate} per US$, indicative
- rate, es: A ₮{rate} por US$, indicativo
- rate, mn: 1 US$-д ₮{rate}, баримжаа
- twin, en: About {other}.
- twin, es: Unos {other}.
- twin, mn: Ойролцоогоор {other}.

## A contract's panel

**Machine-translated titles** (`english` on a contract's record,
src/lib/brief/contracts/model.ts). A contract's English title is the machine
translation of its Mongolian title; a title not yet translated shows in
Mongolian and says so ("Not yet translated"), which stays on the face. The
line under a translated title came off the face on 23 October 2026 (Jonas:
"we dont have to show it every single time"). Its wording:

- en: Machine-translated from Mongolian
- es: Traducido automáticamente del mongol
- mn: Монгол хэлнээс машинаар орчуулсан
