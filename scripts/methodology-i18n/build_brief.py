"""Build methodology-brief.{es,mn}.html from the English 2-pager.

(english, spanish, mongolian[, count]) as in build_experience.py: every
English string must be found the expected number of times. Machine
translations made for this page, in the app's own terms; the three types'
descriptions are the app's own (messages labels.contradictionDescription).

Run from the repo root after any change to the English page:
    python3 scripts/methodology-i18n/build_brief.py public/methodology-brief.html public
"""
import sys

NB = "&nbsp;"
CYRILLIC_FACES = '''  @font-face { font-family: "Source Serif 4"; font-style: normal; font-display: swap; font-weight: 200 900;
    src: url("fonts/source-serif-4-cyrillic-wght-normal.woff2") format("woff2");
    unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
  @font-face { font-family: "Source Serif 4"; font-style: normal; font-display: swap; font-weight: 200 900;
    src: url("fonts/source-serif-4-cyrillic-ext-wght-normal.woff2") format("woff2");
    unicode-range: U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F; }
  @font-face { font-family: "Source Sans 3"; font-style: normal; font-display: swap; font-weight: 200 900;
    src: url("fonts/source-sans-3-cyrillic-wght-normal.woff2") format("woff2");
    unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
  @font-face { font-family: "Source Sans 3"; font-style: normal; font-display: swap; font-weight: 200 900;
    src: url("fonts/source-sans-3-cyrillic-ext-wght-normal.woff2") format("woff2");
    unicode-range: U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F; }
'''
FONT_ANCHOR = '''    src: url("fonts/source-sans-3-latin-wght-normal.woff2") format("woff2");
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
'''
HEAD_EN = 'Policy Coherence Analyzer · How the analysis works'
HEAD_ES = 'Analizador de Coherencia de Políticas · Cómo funciona el análisis'
HEAD_MN = 'Бодлогын уялдаа шинжлэгч · Шинжилгээ хэрхэн хийгддэг вэ'
FOOT_EN = 'Methodology as of October 2026. AI-assisted analysis for validation by national experts.'
FOOT_ES = 'Metodología a octubre de 2026. Análisis asistido por IA, para validación por personas expertas nacionales. Traducción automática del original en inglés.'
FOOT_MN = '2026 оны 10-р сарын байдлаарх аргачлал. Хиймэл оюуны тусламжтай шинжилгээ, үндэсний шинжээчдийн хяналтад зориулав. Англи эхээс машин орчуулсан.'

T = [
 ('<html lang="en">', '<html lang="es">', '<html lang="mn">'),
 ('<title>How the analysis works | Policy Coherence Analyzer</title>', '<title>Cómo funciona el análisis | Analizador de Coherencia de Políticas</title>', '<title>Шинжилгээ хэрхэн хийгддэг вэ | Бодлогын уялдаа шинжлэгч</title>'),
 (FONT_ANCHOR, FONT_ANCHOR, FONT_ANCHOR + CYRILLIC_FACES),
 ('  .lenses dt { font-weight: 600; }\n', '  .lenses dt { font-weight: 600; }\n', '  .lenses dt { font-weight: 600; }\n  .lenses { grid-template-columns: 56mm minmax(0, 1fr); }\n'),
 ('  .ai .note + p { margin-top: 1px; }\n',
  '  .ai .note + p { margin-top: 1px; }\n  .example { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); }\n  .body { gap: 3.5mm; }\n',
  '  .ai .note + p { margin-top: 1px; }\n  .example { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); }\n  .body { gap: 3.5mm; }\n'),
 ('<nav class="bar" aria-label="Brief">', '<nav class="bar" aria-label="Resumen">', '<nav class="bar" aria-label="Хураангуй">'),
 ('<a href="/methodology">How it works, step by step</a>', '<a href="/es/methodology">Cómo funciona, paso a paso</a>', '<a href="/mn/methodology">Хэрхэн ажилладаг вэ, алхам алхмаар</a>'),
 ('<button type="button" onclick="window.print()">Print or save as PDF</button>', '<button type="button" onclick="window.print()">Imprimir o guardar como PDF</button>', '<button type="button" onclick="window.print()">Хэвлэх эсвэл PDF хэлбэрээр хадгалах</button>'),
 ('aria-label="Page 1 of 2"', 'aria-label="Página 1 de 2"', 'aria-label="2 хуудасны 1"'),
 ('aria-label="Page 2 of 2"', 'aria-label="Página 2 de 2"', 'aria-label="2 хуудасны 2"'),
 ('<span>Page 1 of 2</span>', '<span>Página 1 de 2</span>', '<span>2 хуудасны 1</span>'),
 ('<span>Page 2 of 2</span>', '<span>Página 2 de 2</span>', '<span>2 хуудасны 2</span>'),
 (HEAD_EN + '</span>', HEAD_ES + '</span>', HEAD_MN + '</span>', 2),
 ('<span>' + FOOT_EN + '</span>', '<span>' + FOOT_ES + '</span>', '<span>' + FOOT_MN + '</span>', 2),
 # ── page 1 ───────────────────────────────────────────────────────────
 ('<h1 class="title">How the analysis works</h1>', '<h1 class="title">Cómo funciona el análisis</h1>', '<h1 class="title">Шинжилгээ хэрхэн хийгддэг вэ</h1>'),
 ('<p class="subtitle">From policy documents to rated target pairs, with an example from Mongolia</p>', '<p class="subtitle">De los documentos a pares de metas calificados, con un ejemplo de Mongolia</p>', '<p class="subtitle">Баримт бичгээс үнэлсэн зорилтын хос хүртэл, Монгол Улсын жишээгээр</p>'),
 ('<p class="label">Purpose</p>', '<p class="label">Propósito</p>', '<p class="label">Зорилго</p>'),
 ('<h2 class="headline">Commitments on climate, nature and land are often made in siloes.</h2>', '<h2 class="headline">Los compromisos de clima, naturaleza y tierra suelen ir por separado.</h2>', '<h2 class="headline">Уур амьсгал, байгаль, газрын амлалт ихэвчлэн тусдаа гардаг.</h2>'),
 ('<p>Ambition has risen for the planet and its people across emerging National Development Plans, Nationally Determined Contributions (NDCs), National Biodiversity Strategies and Action Plans (NBSAPs), National Adaptation Plans (NAPs) and Land Degradation Neutrality (LDN) targets. For each country, a coherence brief gives data-based evidence on synergies, trade-offs and gaps, based on the policy, finance and implementation information provided. It is a decision-support tool, not a decision-maker: the final interpretation rests with policymakers.</p>',
  '<p>La ambición por el planeta y sus habitantes ha crecido en los nuevos Planes Nacionales de Desarrollo, las Contribuciones Determinadas a Nivel Nacional (NDC), las Estrategias y Planes de Acción Nacionales sobre Biodiversidad (NBSAP), los Planes Nacionales de Adaptación (NAP) y las metas de Neutralidad en la Degradación de las Tierras (LDN). Para cada país, una nota de coherencia aporta evidencia basada en datos sobre sinergias, disyuntivas y brechas, a partir de la información de políticas, finanzas e implementación aportada. Apoya la decisión, no decide: la interpretación final corresponde a quienes formulan las políticas.</p>',
  '<p>Шинээр гарч буй Үндэсний хөгжлийн төлөвлөгөө, Үндэсний хэмжээнд тодорхойлсон хувь нэмэр (NDC), Биологийн төрөл зүйлийн үндэсний стратеги, үйл ажиллагааны төлөвлөгөө (NBSAP), Дасан зохицох үндэсний төлөвлөгөө (NAP), Газрын доройтлын саармагжуулалтын (LDN) зорилтуудад дэлхий ба хүмүүсийн төлөөх хүсэл эрмэлзэл нэмэгдсээр байна. Уялдааны товч тойм нь ирүүлсэн бодлого, санхүүжилт, хэрэгжилтийн мэдээлэлд үндэслэн синерги, харилцан буулт, цоорхойн талаар өгөгдөлд суурилсан нотолгоо гаргана. Энэ нь шийдвэр гаргагч биш, дэмжих хэрэгсэл: эцсийн тайлбарыг бодлого боловсруулагчид өгнө.</p>'),
 ('<p class="label">Scope</p>', '<p class="label">Alcance</p>', '<p class="label">Хамрах хүрээ</p>'),
 ('<h2 class="headline">The same method covers targets, funding and implementation.</h2>', '<h2 class="headline">El mismo método abarca metas, financiamiento e implementación.</h2>', '<h2 class="headline">Нэг арга нь зорилт, санхүүжилт, хэрэгжилтийг хамарна.</h2>'),
 ('<p class="note">Level 1</p>', '<p class="note">Nivel 1</p>', '<p class="note">1-р түвшин</p>'),
 ('<p class="col-name">Policy documents and targets</p>', '<p class="col-name">Documentos de política y metas</p>', '<p class="col-name">Бодлогын баримт бичиг ба зорилт</p>'),
 ('<p>Targets in national and sectoral policies, compared pair by pair.</p>', '<p>Metas de políticas nacionales y sectoriales, comparadas par por par.</p>', '<p>Үндэсний болон салбарын бодлогын зорилтуудыг хосоор харьцуулна.</p>'),
 ('<p class="note">Every country analysed</p>', '<p class="note">Todos los países analizados</p>', '<p class="note">Шинжилсэн бүх улс</p>'),
 ('<p class="note">Level 2</p>', '<p class="note">Nivel 2</p>', '<p class="note">2-р түвшин</p>'),
 ('<p class="col-name">Funding commitments</p>', '<p class="col-name">Compromisos de financiamiento</p>', '<p class="col-name">Санхүүжилтийн амлалт</p>'),
 ('<p>Programmes in budget reviews, such as a Biodiversity Expenditure Review (BER).</p>', '<p>Programas de revisiones presupuestarias, como una Revisión del Gasto en Biodiversidad (BER).</p>', '<p>Төсвийн тоймын хөтөлбөр, тухайлбал Биологийн олон янз байдлын зарлагын тойм (BER).</p>'),
 ('<p class="note">Where budget data exists</p>', '<p class="note">Donde hay datos presupuestarios</p>', '<p class="note">Төсвийн мэдээлэлтэй тохиолдолд</p>'),
 ('<p class="note">Level 3</p>', '<p class="note">Nivel 3</p>', '<p class="note">3-р түвшин</p>'),
 ('<p class="col-name">Implementation progress</p>', '<p class="col-name">Avance de la implementación</p>', '<p class="col-name">Хэрэгжилтийн явц</p>'),
 ('<p>Actions reported in Biennial Transparency Reports (BTRs) and national reports.</p>', '<p>Acciones reportadas en los Informes Bienales de Transparencia (BTR) y en informes nacionales.</p>', '<p>Хоёр жил тутмын ил тод байдлын тайлан (BTR), үндэсний тайлангийн арга хэмжээ.</p>'),
 ('<p class="note">Where reporting data exists</p>', '<p class="note">Donde hay datos de reporte</p>', '<p class="note">Тайлагналын мэдээлэлтэй тохиолдолд</p>'),
 ('<p class="label">Method</p>', '<p class="label">Método</p>', '<p class="label">Арга зүй</p>'),
 ('<h2 class="headline">The method runs in 13 steps, from documents to rated target pairs.</h2>', '<h2 class="headline">El método sigue 13 pasos, de los documentos a pares de metas calificados.</h2>', '<h2 class="headline">Баримт бичгээс үнэлсэн зорилтын хос хүртэл 13 алхамтай.</h2>'),
 ('<p class="note">Extraction</p>', '<p class="note">Extracción</p>', '<p class="note">Зорилт гаргах</p>'),
 ('<p class="note">Analysis</p>', '<p class="note">Análisis</p>', '<p class="note">Шинжилгээ</p>'),
 ('<p class="note">Synthesis</p>', '<p class="note">Síntesis</p>', '<p class="note">Нэгтгэл</p>'),
 ('<span>Upload the documents</span>', '<span>Cargar los documentos</span>', '<span>Баримт бичиг оруулах</span>'),
 ('<span>Read every page</span>', '<span>Leer cada página</span>', '<span>Хуудас бүрийг унших</span>'),
 ('<span>Extract targets word for word</span>', '<span>Extraer metas textuales</span>', '<span>Зорилтыг үгчлэн гаргах</span>'),
 ('<span>Merge and check the figures</span>', '<span>Unir y verificar cifras</span>', '<span>Нэгтгэж, тоог шалгах</span>'),
 ('<span>Confirm the targets</span>', '<span>Confirmar las metas</span>', '<span>Зорилт баталгаажуулах</span>'),
 ('<span>Note figures and deadlines</span>', '<span>Anotar cifras y plazos</span>', '<span>Тоо, хугацаа тэмдэглэх</span>'),
 ('<span>Classify by policy area</span>', '<span>Clasificar por área</span>', '<span>Чиглэлээр ангилах</span>'),
 ('<span>Pair across documents</span>', '<span>Emparejar entre documentos</span>', '<span>Баримт бичгүүдээр хослуулах</span>'),
 ('<span>Break into five parts</span>', '<span>Descomponer en 5 partes</span>', '<span>5 хэсэгт задлах</span>'),
 ('<span>Rate each pair</span>', '<span>Calificar cada par</span>', '<span>Хос бүрийг үнэлэх</span>'),
 ('<span>Bring the ratings together</span>', '<span>Reunir calificaciones</span>', '<span>Үнэлгээг нэгтгэх</span>'),
 ('<span>Find recurring themes</span>', '<span>Hallar temas recurrentes</span>', '<span>Давтагдах сэдэв илрүүлэх</span>'),
 ('<span>Rate the explanations</span>', '<span>Calificar explicaciones</span>', '<span>Тайлбарыг үнэлэх</span>'),
 ('<p class="after">Every target is quoted word for word with its source page, and a reviewer confirms the set before any comparison. One AI agent breaks each target into its goal, action, area, actors and expected outcome; a second rates each pair from those parts and explains the rating.</p>',
  '<p class="after">Cada meta se cita palabra por palabra con su página de origen, y una persona revisora confirma el conjunto antes de cualquier comparación. Un agente de IA descompone cada meta en su objetivo, acción, área, actores y resultado esperado; un segundo califica cada par a partir de esas partes y explica la calificación.</p>',
  '<p class="after">Зорилт бүрийг эх хуудастай нь үгчлэн иш татаж, харьцуулалтаас өмнө хянагч багцыг баталгаажуулна. Хиймэл оюуны нэг агент зорилт бүрийг зорилго, арга хэмжээ, бүс, оролцогч, үр дүнд задалж, нөгөө нь эдгээрт үндэслэн хос бүрийг үнэлж, тайлбарлана.</p>'),
 ('<p class="label">Ratings</p>', '<p class="label">Calificaciones</p>', '<p class="label">Үнэлгээ</p>'),
 ('<h2 class="headline">Each target pair is rated on a 5-level scale.</h2>', '<h2 class="headline">Cada par de metas se califica en una escala de 5 niveles.</h2>', '<h2 class="headline">Зорилтын хос бүрийг 5 түвшний хэмжүүрээр үнэлнэ.</h2>'),
 ('<p class="chart-label">Mongolia, 13,404 target pairs</p>', '<p class="chart-label">Mongolia, 13.404 pares de metas</p>', '<p class="chart-label">Монгол Улс, 13,404 зорилтын хос</p>'),
 ('<li><span>Strong alignment</span>', '<li><span>Alineación fuerte</span>', '<li><span>Хүчтэй уялдаа</span>'),
 ('<li><span>Moderate alignment</span>', '<li><span>Alineación moderada</span>', '<li><span>Дунд зэргийн уялдаа</span>'),
 ('<li><span>Partial alignment</span>', '<li><span>Alineación parcial</span>', '<li><span>Хэсэгчилсэн уялдаа</span>'),
 ('<li><span>No clear relationship</span>', '<li><span>Sin relación clara</span>', '<li><span>Тодорхой холбоогүй</span>'),
 ('<li><span>Potential misalignment</span>', '<li><span>Posible desalineación</span>', '<li><span>Болзошгүй үл нийцэл</span>'),
 ('<b>10%</b>', '<b>10' + NB + '%</b>', '<b>10%</b>'),
 ('<b>56%</b>', '<b>56' + NB + '%</b>', '<b>56%</b>'),
 ('<b>29%</b>', '<b>29' + NB + '%</b>', '<b>29%</b>'),
 ('<b>&lt;1%</b>', '<b>&lt;1' + NB + '%</b>', '<b>&lt;1%</b>'),
 ('<b>5%</b>', '<b>5' + NB + '%</b>', '<b>5%</b>'),
 ('<p class="after">Strong and moderate alignment count as aligned: 66% of Mongolia’s target pairs. A potential misalignment is given only when the AI can name what the two targets compete for, or how pursuing one may make the other harder to reach.</p>',
  '<p class="after">La alineación fuerte y la moderada cuentan como alineadas: el 66' + NB + '% de los pares de Mongolia. Solo hay posible desalineación si la IA puede nombrar por qué compiten las dos metas, o cómo perseguir una dificulta la otra.</p>',
  '<p class="after">Хүчтэй, дунд зэргийн уялдаа нь уялдаатайд тооцогдоно: Монгол Улсын хосуудын 66%. Зорилтууд юуны төлөө өрсөлдөх, эсвэл нэг нь нөгөөг хэрхэн хүндрүүлэхийг хиймэл оюун нэрлэж чадвал л болзошгүй үл нийцэл гэж үнэлнэ.</p>'),
 # ── page 2 ───────────────────────────────────────────────────────────
 ('<p class="label">Potential misalignment</p>', '<p class="label">Posible desalineación</p>', '<p class="label">Болзошгүй үл нийцэл</p>'),
 ('<h2 class="headline">A potential misalignment is a prompt for expert review.</h2>', '<h2 class="headline">Una posible desalineación es una señal para la revisión experta.</h2>', '<h2 class="headline">Болзошгүй үл нийцэл нь шинжээчийн хяналтын дохио.</h2>'),
 ('<p class="chart-label">Mongolia, 671 potential misalignments by type</p>', '<p class="chart-label">Mongolia, 671 posibles desalineaciones por tipo</p>', '<p class="chart-label">Монгол Улс, болзошгүй 671 үл нийцэл, төрлөөр</p>'),
 ('<li><span>Delivery &amp; coordination</span>', '<li><span>Entrega y coordinación</span>', '<li><span>Хэрэгжилт ба зохицуулалт</span>'),
 ('<b>59%</b>', '<b>59' + NB + '%</b>', '<b>59%</b>'),
 ('<span class="desc">The goals are compatible; the gap is in delivery: how one is implemented undermines the other (mismatched scale, timing, or coordination across actors).</span>',
  '<span class="desc">Los objetivos son compatibles; la brecha está en la entrega: cómo se implementa uno socava al otro (escala, calendario o coordinación entre actores desalineados).</span>',
  '<span class="desc">Зорилгууд нийцдэг; зөрүү нь хэрэгжилтэд байна: нэгийг хэрэгжүүлэх арга нь нөгөөг сулруулдаг (хэмжээ, цаг хугацаа, эсвэл оролцогчдын хоорондын зохицуулалт таарахгүй).</span>'),
 ('<li><span>Competing for resources</span>', '<li><span>Competencia por recursos</span>', '<li><span>Нөөцийн төлөөх өрсөлдөөн</span>'),
 ('<b>32%</b>', '<b>32' + NB + '%</b>', '<b>32%</b>'),
 ('<span class="desc">The goals are compatible but compete for the same limited resource: land, water, budget, or capacity.</span>',
  '<span class="desc">Los objetivos son compatibles pero compiten por el mismo recurso limitado: tierra, agua, presupuesto o capacidad.</span>',
  '<span class="desc">Зорилгууд нийцэх боловч ижил хязгаарлагдмал нөөцийн төлөө өрсөлддөг: газар, ус, төсөв, эсвэл чадавх.</span>'),
 ('<li><span>Conflicting goals</span>', '<li><span>Objetivos en conflicto</span>', '<li><span>Зөрчилдөх зорилго</span>'),
 ('<b>9%</b>', '<b>9' + NB + '%</b>', '<b>9%</b>'),
 ('<span class="desc">The objectives themselves conflict: achieving one substantively means not achieving the other.</span>',
  '<span class="desc">Los propios objetivos están en conflicto: lograr uno sustantivamente significa no lograr el otro.</span>',
  '<span class="desc">Зорилго өөрсдөө хоорондоо зөрчилддөг: нэгийг нь биелүүлэх нь нөгөөг биелүүлэхгүй гэсэн үг.</span>'),
 ('<p class="after">Each also records whether it appears manageable or fundamental, and the AI’s confidence.</p>', '<p class="after">Cada una registra además si parece manejable o fundamental, y la confianza de la IA.</p>', '<p class="after">Мөн зохицуулах боломжтой эсвэл суурь эсэх, хиймэл оюуны итгэлийг бүртгэнэ.</p>'),
 ('<p class="label">Example · Mongolia</p>', '<p class="label">Ejemplo · Mongolia</p>', '<p class="label">Жишээ · Монгол Улс</p>'),
 ('<h2 class="headline">A spatial-planning target and a water target may compete for land.</h2>', '<h2 class="headline">Dos metas de Mongolia pueden competir por la tierra.</h2>', '<h2 class="headline">Монгол Улсын хоёр зорилт газрын төлөө өрсөлдөж болзошгүй.</h2>'),
 ('</span>Potential misalignment<span class="sep">·</span><span class="sub">Competing for resources</span><span class="sep">·</span><span class="sub">Manageable</span>', '</span>Posible desalineación<span class="sep">·</span><span class="sub">Competencia por recursos</span><span class="sep">·</span><span class="sub">Manejable</span>', '</span>Болзошгүй үл нийцэл<span class="sep">·</span><span class="sub">Нөөцийн төлөөх өрсөлдөөн</span><span class="sep">·</span><span class="sub">Зохицуулах боломжтой</span>'),
 ('<p class="stop-doc">National biodiversity targets for 2030</p>', '<p class="stop-doc">Metas nacionales de biodiversidad para 2030</p>', '<p class="stop-doc">Биологийн төрөл зүйлийн 2030 оны үндэсний зорилтууд</p>'),
 ('<p class="stop-label">1 Spatial planning</p>', '<p class="stop-label">1 Planificación espacial</p>', '<p class="stop-label">1 Орон зайн төлөвлөлт</p>'),
 ('<p>By 2030, reduce biodiversity loss and maintain ecological integrity by including all territory in spatial planning and ensuring effective management.</p>',
  '<p>Para 2030, reducir la pérdida de biodiversidad y mantener la integridad ecológica incluyendo todo el territorio en la planificación espacial y garantizando una gestión eficaz.</p>',
  '<p>2030 он гэхэд бүх нутаг дэвсгэрийг орон зайн төлөвлөлтөд хамруулж, үр дүнтэй менежментийг хангах замаар биологийн олон янз байдлын алдагдлыг бууруулж, экологийн бүрэн бүтэн байдлыг хадгална.</p>'),
 ('<p class="stop-doc">Nationally Determined Contribution</p>', '<p class="stop-doc">Contribución Determinada a Nivel Nacional</p>', '<p class="stop-doc">Үндэсний хэмжээнд тодорхойлсон хувь нэмэр</p>'),
 ('<p class="stop-label">Water resources 2</p>', '<p class="stop-label">Recursos hídricos 2</p>', '<p class="stop-label">Усны нөөц 2</p>'),
 ('<p>Enhance the resilience of the water sector through the utilization of advanced technologies for conservation, restoration, sustainable use and secure water availability.</p>',
  '<p>Mejorar la resiliencia del sector hídrico mediante el uso de tecnologías avanzadas para la conservación, la restauración, el uso sostenible y la disponibilidad segura de agua.</p>',
  '<p>Усны салбарын тэсвэрлэх чадварыг хамгаалах, нөхөн сэргээх, тогтвортой ашиглах болон усны найдвартай хүртээмжийг хангах зорилгоор дэвшилтэт технологийг ашиглах замаар бэхжүүлэх.</p>'),
 ('<p class="note">AI explanation · Medium confidence</p>', '<p class="note">Explicación de la IA · Confianza media</p>', '<p class="note">Хиймэл оюуны тайлбар · Дунд итгэл</p>'),
 ('<p>Both targets support ecosystem protection and planning, but the NDC also names water accumulation facilities, irrigation ponds, canals and pipelines … which can compete with the NBSAP target’s aim to maintain natural ecosystems and prevent further decline across all territory through land-use planning.</p>',
  '<p>Ambas metas apoyan la protección y la planificación de los ecosistemas, pero la NDC también menciona instalaciones de acumulación de agua, estanques de riego, canales y tuberías … que pueden competir con el objetivo de la meta del NBSAP de mantener los ecosistemas naturales …</p>',
  '<p>Хоёр зорилт хоёулаа экосистемийг хамгаалах, төлөвлөхийг дэмждэг боловч NDC-д мөн ус хуримтлуулах байгууламж, усалгааны цөөрөм, суваг, хоолой … зэргийг дурдсан бөгөөд эдгээр нь байгалийн экосистемийг хадгалах NBSAP-ын зорилттой өрсөлдөж болзошгүй …</p>'),
 ('<p class="meta">Resources involved: land</p>', '<p class="meta">Recursos implicados: tierra</p>', '<p class="meta">Холбогдох нөөц: газар</p>'),
 ('<p class="place">Between the NDC and the NBSAP, 92% of the 720 target pairs are aligned and 3% show potential misalignment. This pair is 1 of those 19.</p>',
  '<p class="place">Entre la NDC y el NBSAP, el 92' + NB + '% de los 720 pares de metas están alineados y el 3' + NB + '% muestra una posible desalineación. Este par es 1 de esos 19.</p>',
  '<p class="place">NDC ба NBSAP-ын хооронд 720 зорилтын хосын 92% нь уялдаатай, 3% нь болзошгүй үл нийцэлтэй. Энэ хос бол тэдгээр 19-ийн нэг.</p>'),
 ('<p class="label">Policy areas</p>', '<p class="label">Áreas de política</p>', '<p class="label">Бодлогын чиглэл</p>'),
 ('<h2 class="headline">Targets are grouped by policy area under 4 lenses.</h2>', '<h2 class="headline">Las metas se agrupan por área de política con 4 lentes.</h2>', '<h2 class="headline">Зорилтуудыг 4 ангиллын хүрээгээр бодлогын чиглэлд бүлэглэнэ.</h2>'),
 ('<dt>Biodiversity</dt><dd>The Global Biodiversity Expenditure (GLOBE) taxonomy</dd>', '<dt>Biodiversidad</dt><dd>La taxonomía Global de Gasto en Biodiversidad (GLOBE)</dd>', '<dt>Биологийн төрөл зүйл</dt><dd>Биологийн олон янз байдлын зарлагын дэлхийн (GLOBE) ангилал</dd>'),
 ('<dt>Climate mitigation</dt><dd>Greenhouse gas inventory sectors of the Intergovernmental Panel on Climate Change</dd>', '<dt>Mitigación climática</dt><dd>Sectores del inventario de gases de efecto invernadero del Grupo Intergubernamental de Expertos sobre el Cambio Climático</dd>', '<dt>Уур амьсгалын өөрчлөлтийг сааруулах</dt><dd>Уур амьсгалын өөрчлөлтийн асуудлаарх Засгийн газар хоорондын мэргэжилтнүүдийн хорооны хүлэмжийн хийн тооллогын салбарууд</dd>'),
 ('<dt>Climate adaptation</dt><dd>The seven targets of the UAE Framework for Global Climate Resilience</dd>', '<dt>Adaptación climática</dt><dd>Las siete metas del Marco de los Emiratos Árabes Unidos para la Resiliencia Climática Mundial</dd>', '<dt>Уур амьсгалын дасан зохицол</dt><dd>Уур амьсгалын дэлхийн тэсвэрлэлтийн хүрээний долоон зорилт</dd>'),
 ('<dt>Human rights</dt><dd>Nine themes from UNDP guidance for this tool, draft under expert review</dd>', '<dt>Derechos humanos</dt><dd>Nueve temas de la orientación del PNUD para esta herramienta (borrador en revisión)</dd>', '<dt>Хүний эрх</dt><dd>НҮБХХ-ийн энэ хэрэгсэлд зориулсан удирдамжийн 9 сэдэв (төсөл)</dd>'),
 ('<p>Each target keeps one primary area and any others it clearly relates to. Sri Lanka reads adaptation through its own NDC 3.0 sectors and adds a lens on loss and damage.</p>',
  '<p>Cada meta conserva un área principal y cualquier otra con la que se relacione claramente. Sri Lanka analiza la adaptación con sus propios sectores de la NDC 3.0 y añade una lente de pérdidas y daños.</p>',
  '<p>Зорилт бүр нэг үндсэн чиглэл болон тодорхой холбоотой бусад чиглэлээ хадгална. Шри Ланка өөрийн NDC 3.0 салбарууд, хохирол ба хор уршгийн ангиллыг нэмсэн.</p>'),
 ('<p class="label">Social and environmental safeguards</p>', '<p class="label">Salvaguardas sociales y ambientales</p>', '<p class="label">Нийгэм, байгаль орчны хамгаалалт</p>'),
 ('<p><b>Human in the loop.</b> Reviewers confirm the targets; national experts verify the findings.</p>', '<p><b>Intervención humana.</b> Las personas revisoras confirman las metas; personas expertas nacionales verifican los hallazgos.</p>', '<p><b>Хүний оролцоо.</b> Хянагчид зорилтыг баталгаажуулж, шинжээчид дүгнэлтийг нягтална.</p>'),
 ('<p><b>Traceable.</b> The AI reads only the policy text it is given; every target keeps its source page.</p>', '<p><b>Trazable.</b> La IA solo lee el texto de política que recibe; cada meta conserva su página de origen.</p>', '<p><b>Мөрдөх боломжтой.</b> Хиймэл оюун зөвхөн өгсөн текстийг уншина; зорилт бүр эх хуудастай.</p>'),
 ('<p><b>Data sovereignty and model selection.</b> A country chooses the AI model, and so where its data is processed.</p>', '<p><b>Soberanía de datos y elección de modelo.</b> Un país elige el modelo de IA y, con ello, dónde se procesan sus datos.</p>', '<p><b>Өгөгдлийн бүрэн эрх.</b> Улс орон загвараа сонгож, өгөгдлөө хаана боловсруулахаа шийднэ.</p>'),
 ('<p><b>Frugal AI.</b> The carbon, energy, water and mineral footprint of every analysis is measured and published.</p>', '<p><b>IA frugal.</b> Se mide y publica la huella de carbono, energía, agua y minerales de cada análisis.</p>', '<p><b>Хэмнэлттэй хиймэл оюун.</b> Шинжилгээ бүрийн байгаль орчны ул мөрийг хэмжиж нийтэлдэг.</p>'),
 ('<p class="after">The Analyzer is being built as an open-source Digital Public Good that governments can run themselves.</p>', '<p class="after">El Analizador se desarrolla como un Bien Público Digital de código abierto que los gobiernos pueden operar por su cuenta.</p>', '<p class="after">Засгийн газар өөрөө ажиллуулах нээлттэй эхийн Дижитал нийтийн бараа болгон хөгжүүлж байна.</p>'),
]

def build(src, col):
    out = src
    for entry in T:
        en = entry[0]; n = entry[3] if len(entry) > 3 else 1
        found = out.count(en)
        if found != n:
            raise SystemExit(f"[{('es','mn')[col-1]}] expected {n}, found {found}: {en[:90]!r}")
        out = out.replace(en, entry[col])
    return out

if __name__ == "__main__":
    src_path, out_dir = sys.argv[1], sys.argv[2]
    src = open(src_path, encoding="utf-8").read()
    for col, lang in ((1, "es"), (2, "mn")):
        html = build(src, col)
        open(f"{out_dir}/methodology-brief.{lang}.html", "w", encoding="utf-8").write(html)
        print(lang, "written", len(html))
