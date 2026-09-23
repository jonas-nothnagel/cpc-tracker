/*
 * How it works: the left-hand scenes, in the coherence brief's visual
 * language. One ink dot per target, then one per target pair, moving from
 * step to step the way the brief's dots settle. The page's own script calls
 * MethodScene.go(step) with the step's position in the walkthrough.
 *
 * Every number is Mongolia's analysis as the brief shows it (gpt-5-4 run,
 * 8 documents, read 23 September 2026 from the dashboard payload). Each
 * target dot carries its own target's flags, category and links (per-target
 * strings below, in document order), so a dot moves where its target goes.
 * Target pairs are counted, not individually traced.
 */
(function () {
  "use strict";

  var INK = "#232e3d";
  var GREEN = "#2a7443";
  var GREEN_LIGHT = "#a8cbb2";
  var GREY = "#a9b3a4";
  var RED = "#d2432c";
  var RED_LIGHT = "#f1b1a4";
  var NONE = "#cfcfc9";
  var LINE = "#dfe2e6";
  var LINE_DARK = "#b9bfc7";
  var HUMAN = "#9a6b34";
  var BLUE = "#0468b1";

  var DOCS = [
    ["Vision 2050", 15],
    ["NDC", 36],
    ["Res. 91", 16],
    ["NBSAP", 20],
    ["NAP", 15],
    ["FSS", 41],
    ["LDN Targets", 27],
    ["ILDN", 8],
  ];
  // Per target, in document order: measurable group (0 a number and a date,
  // 1 a number, 2 a date, 3 neither), primary GLOBE category (index into
  // GLOBE, 9 not classified), and whether it aligns with at least one
  // reviewed budget programme / reported measure (1) or not (0).
  var PER_TARGET = {
    measure: ["333333333013333", "000033333333333333333333333333333333", "0000000000013333", "20022222222222223322", "333333333333333", "03333333333333133113313113313333333333333", "033333313333333303333303333", "33333333"],
    globe: ["000000000602511", "202016601000513130000000000934411111", "2222223302201114", "15667220138113711441", "141500033000041", "19111240340439000000000000000000090939003", "050031013005010000201166011", "00615151"],
    fin: ["111111111111111", "111111111111111111111111111111111111", "1111111111111111", "11111111111111111111", "111111111111111", "10011111011011111011101101000100000000000", "111111111111111111111111111", "11111111"],
    imp: ["111111111111111", "111111111111111111111111111111111111", "1111111111111111", "11111111111111011111", "111111111111111", "11111111111110111111111111111011101111111", "111111111111111111111011111", "11111111"],
  };
  function countOnes(str) { return str.split("").filter(function (c) { return c === "1"; }).length; }
  var FINANCE = PER_TARGET.fin.map(countOnes);
  var IMPLEMENTATION = PER_TARGET.imp.map(countOnes);
  var MEASURE = [
    ["A number and a date", 22],
    ["A number", 10],
    ["A date", 16],
    ["Neither", 130],
  ];
  var GLOBE = [
    ["Sustainable use", 75],
    ["Biodiversity planning and finance", 38],
    ["Pollution management", 15],
    ["Green economy", 15],
    ["Biodiversity awareness and knowledge", 10],
    ["Restoration", 8],
    ["Protected areas and other conservation measures", 8],
    ["Biosafety", 2],
    ["Access and benefit sharing", 1],
    ["Not classified", 6],
  ];
  var TONES = [
    ["aligned", 8862, GREEN],
    ["partially aligned", 3861, GREY],
    ["potential misalignment", 671, RED],
    ["no clear relationship", 10, NONE],
  ];
  var THEMES_ALIGNED = [
    ["Climate resilient agriculture and pasture management", 2636],
    ["Climate and biodiversity enabling systems across sectors", 2527],
    ["Sustainable land restoration and stewardship pathways", 2115],
    ["Other aligned pairs", 1584],
  ];
  var THEMES_APART = [
    ["Land allocation pressures from agricultural expansion", 295],
    ["Water allocation pressures from irrigation growth", 150],
    ["Hydropower and livestock delivery in sensitive landscapes", 71],
    ["Other pairs with potential misalignment", 155],
  ];
  var FIELDS = ["Goal", "Action", "Ecosystem", "Audience", "Outcome"];

  var CAPTIONS = [
    ["Extraction", "Eight policy documents, read in full."],
    ["Extraction", "Page by page; forewords and annexes set aside."],
    ["Extraction", "178 targets, word for word."],
    ["Extraction", "Every figure, year and framework traced to its source."],
    ["Human step", "A reviewer keeps, edits or adds targets."],
    ["Analysis", "48 of the 178 targets carry a number or a date."],
    ["Analysis", "Each target placed in a category of the selected lens."],
    ["Analysis", "13,404 target pairs: every target against every target in the other documents."],
    ["Analysis · Agent 1", "Each target broken into five parts before any comparison."],
    ["Analysis · Agent 2", "Each pair rated from the two targets' texts."],
    ["Synthesis", "66% of target pairs are aligned; 5% show potential misalignment."],
    ["Synthesis", "Aligned and potentially misaligned pairs grouped into recurring themes."],
    ["Human step", "Each insight can be rated with a thumb and a note."],
    ["Level 2 · Finance", "157 of the 178 targets align with at least one of 28 reviewed budget programmes."],
    ["Level 3 · Implementation", "173 of the 178 targets align with at least one of 39 reported measures."],
  ];

  function seeded(seed) {
    var s = seed | 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ── Particles ──────────────────────────────────────────────────────
  var targets = [];
  DOCS.forEach(function (d, di) {
    for (var i = 0; i < d[1]; i++) {
      targets.push({
        doc: di,
        i: i,
        measure: +PER_TARGET.measure[di][i],
        globe: +PER_TARGET.globe[di][i],
        fin: PER_TARGET.fin[di][i] === "1",
        imp: PER_TARGET.imp[di][i] === "1",
        // The worked example: NBSAP Target 1 and NDC "Water resources 2".
        ex: (di === 3 && i === 0) || (di === 1 && i === 9),
      });
    }
  });

  var pairs = [];
  TONES.forEach(function (tone, ti) {
    for (var n = 0; n < tone[1]; n++) pairs.push({ tone: ti, theme: -1 });
  });
  (function () {
    var k = 0;
    THEMES_ALIGNED.forEach(function (g, gi) {
      for (var n = 0; n < g[1]; n++, k++) pairs[k].theme = gi;
    });
    k = TONES[0][1] + TONES[1][1];
    THEMES_APART.forEach(function (g, gi) {
      for (var n = 0; n < g[1]; n++, k++) pairs[k].theme = gi;
    });
  })();
  // A fixed scatter order for the unsorted field, and the two targets each
  // pair springs from in the compare scene.
  var rand = seeded(7919);
  var perm = pairs.map(function (_, i) { return i; });
  for (var i = perm.length - 1; i > 0; i--) {
    var j = Math.floor(rand() * (i + 1));
    var tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
  }
  var slot = new Int32Array(pairs.length);
  perm.forEach(function (p, s) { slot[p] = s; });
  var spring = pairs.map(function () {
    var a = Math.floor(rand() * targets.length);
    var b = Math.floor(rand() * targets.length);
    while (targets[b].doc === targets[a].doc) b = Math.floor(rand() * targets.length);
    return [a, b];
  });

  // Current and target states: x, y, r, alpha, colour per particle.
  function stateArrays(n) {
    return { x: new Float32Array(n), y: new Float32Array(n), r: new Float32Array(n), a: new Float32Array(n), c: new Array(n) };
  }
  var T0 = stateArrays(targets.length), T1 = stateArrays(targets.length);
  var P0 = stateArrays(pairs.length), P1 = stateArrays(pairs.length);
  var ring = new Uint8Array(targets.length);
  var lines = { a0: 0, a1: 0, kept: false };

  // ── Canvas ─────────────────────────────────────────────────────────
  var wrap, canvas, ctx, labelsEl, capEl, W = 0, H = 0, step = -1, start = 0, frame = 0;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function box() {
    var left = 56, right = 56, top = 150, bottom = 110;
    return { x: left, y: top, w: Math.max(200, W - left - right), h: Math.max(160, H - top - bottom) };
  }

  function docColumns(b, compact) {
    var cols = [];
    var colW = b.w / DOCS.length;
    var perRow = 5;
    var pitch = compact ? Math.min(7, (colW - 12) / 8) : Math.min(15, (colW - 18) / perRow);
    DOCS.forEach(function (d, di) {
      cols.push({ x: b.x + di * colW + 6, y: b.y + (compact ? 22 : 34), w: colW - 12, pitch: pitch, perRow: compact ? 8 : perRow });
    });
    return cols;
  }

  function place(state, i, x, y, r, a, c) {
    state.x[i] = x; state.y[i] = y; state.r[i] = r; state.a[i] = a; state.c[i] = c;
  }

  /** Groups side by side in a box, one dot per unit, like the brief's field. */
  function fieldGroups(counts, b) {
    var total = counts.reduce(function (s, c) { return s + c; }, 0);
    var gap = 2;
    var pitch = Math.sqrt((b.w * b.h) / Math.max(1, total));
    for (var k = 0; k < 400; k++) {
      var rows = Math.max(1, Math.floor(b.h / pitch));
      var cols = counts.reduce(function (s, c) { return s + Math.ceil(c / rows); }, 0);
      if (cols * pitch + (counts.length - 1) * gap * pitch <= b.w) break;
      pitch *= 0.985;
    }
    var rowsN = Math.max(1, Math.floor(b.h / pitch));
    var out = [], x = b.x;
    counts.forEach(function (c) {
      var x0 = x;
      out.push({ x0: x0, x1: x0 + Math.ceil(c / rowsN) * pitch, rows: rowsN, pitch: pitch });
      x += Math.ceil(c / rowsN) * pitch + gap * pitch;
    });
    return out;
  }

  function fieldPos(group, n, b) {
    var col = Math.floor(n / group.rows), row = n % group.rows;
    return [group.x0 + col * group.pitch + group.pitch / 2, b.y + row * group.pitch + group.pitch / 2];
  }

  /** Clusters in a wrapping row, each a small grid, with its label above. */
  function clusters(groups, b, pitch) {
    var out = [], x = b.x, y = b.y + 26, rowH = 0;
    groups.forEach(function (g) {
      var n = g[1];
      var cols = Math.max(3, Math.ceil(Math.sqrt(n * 1.8)));
      var w = Math.max(cols * pitch, 110), h = Math.ceil(n / cols) * pitch;
      if (x + w > b.x + b.w && x > b.x) { x = b.x; y += rowH + 54; rowH = 0; }
      out.push({ x: x, y: y, cols: cols, pitch: pitch, w: w, h: h, name: g[0], n: n });
      x += w + 36; rowH = Math.max(rowH, h);
    });
    return out;
  }

  function label(x, y, html, cls) {
    return { x: x, y: y, html: html, cls: cls || "" };
  }

  function fmt(n) { return n.toLocaleString("en-US"); }

  // ── Scenes ─────────────────────────────────────────────────────────
  function sceneFor(k) {
    var b = box();
    var labs = [];
    var pairAlpha = 0;
    ring.fill(0);
    lines.a1 = k <= 1 ? 1 : 0;
    lines.kept = k === 1;

    // Targets
    if (k <= 4 || k >= 13) {
      var cols = docColumns(b, false);
      targets.forEach(function (t, ti) {
        var col = cols[t.doc];
        var x = col.x + (t.i % col.perRow) * col.pitch + col.pitch / 2;
        var y = col.y + Math.floor(t.i / col.perRow) * col.pitch + col.pitch / 2 + (k <= 1 ? 170 : 0);
        var a = k <= 1 ? 0 : 1;
        var c = INK;
        var r = col.pitch * 0.32;
        if (k === 3) ring[ti] = 1;
        if (k === 4) ring[ti] = 2;
        if (k === 13) { c = t.fin ? BLUE : LINE_DARK; }
        if (k === 14) { c = t.imp ? GREEN : LINE_DARK; }
        if (t.ex && document.body.classList.contains("show-example") && k >= 2) ring[ti] = 3;
        place(T1, ti, x, y, r, a, c);
      });
      cols.forEach(function (col, di) {
        var extra = "";
        if (k >= 2 && k <= 4) extra = ' <span class="n">' + DOCS[di][1] + "</span>";
        if (k === 13) extra = ' <span class="n">' + FINANCE[di] + " of " + DOCS[di][1] + "</span>";
        if (k === 14) extra = ' <span class="n">' + IMPLEMENTATION[di] + " of " + DOCS[di][1] + "</span>";
        labs.push(label(col.x, col.y - 26, DOCS[di][0] + extra, "sl-doc"));
      });
      if (k === 13 || k === 14) {
        var n = k === 13 ? 28 : 39;
        var html = "";
        for (var q = 0; q < n; q++) html += '<i style="background:' + (k === 13 ? BLUE : GREEN) + '"></i>';
        labs.push(label(b.x, b.y + b.h - 34, '<span class="squares">' + html + "</span> " + (k === 13 ? "28 reviewed budget programmes (Biodiversity Expenditure Review)" : "39 reported measures (Biennial Transparency Report)"), "sl-foot"));
      }
    } else if (k === 5 || k === 6) {
      var groups = k === 5 ? MEASURE : GLOBE;
      var key = k === 5 ? "measure" : "globe";
      var cl = clusters(groups, b, k === 5 ? 13 : 12);
      var seen = groups.map(function () { return 0; });
      targets.forEach(function (t, ti) {
        var g = t[key], c = cl[g], n = seen[g]++;
        var x = c.x + (n % c.cols) * c.pitch + c.pitch / 2;
        var y = c.y + Math.floor(n / c.cols) * c.pitch + c.pitch / 2;
        var colr = k === 5 ? (g === 0 ? INK : g === 3 ? LINE_DARK : "#6b7480") : INK;
        place(T1, ti, x, y, c.pitch * 0.34, 1, colr);
        if (t.ex && document.body.classList.contains("show-example")) ring[ti] = 3;
      });
      cl.forEach(function (c) {
        labs.push(label(c.x, c.y - 22, '<span class="n">' + c.n + "</span> " + c.name, "sl-cluster"));
      });
    } else {
      // Pair scenes: targets shrink into a thin band at the top, then fade.
      var cc = docColumns(b, true);
      targets.forEach(function (t, ti) {
        var col = cc[t.doc];
        var x = col.x + (t.i % col.perRow) * col.pitch + col.pitch / 2;
        var y = col.y + Math.floor(t.i / col.perRow) * col.pitch + col.pitch / 2;
        var show = k === 7 || (k === 8 && t.ex);
        place(T1, ti, x, y, k === 8 && t.ex ? 7 : col.pitch * 0.32, show ? 1 : 0, INK);
        if (k === 8 && t.ex) ring[ti] = 3;
      });
      if (k === 7) cc.forEach(function (col, di) { labs.push(label(col.x, col.y - 20, DOCS[di][0], "sl-doc sl-small")); });
    }

    // Pairs
    var fb = { x: b.x, y: b.y + 96, w: b.w, h: b.h - 96 };
    if (k >= 7 && k <= 12) {
      pairAlpha = 1;
      if (k <= 9) {
        var g1 = fieldGroups([pairs.length], fb)[0];
        pairs.forEach(function (p, pi) {
          var pos = fieldPos(g1, slot[pi], fb);
          var col = k === 9 ? TONES[p.tone][2] : GREY;
          place(P1, pi, pos[0], pos[1], g1.pitch * 0.34, k === 8 ? 0.25 : 1, col);
        });
        if (k === 8) {
          // The example pair, pulled out and broken into its parts.
          var cx = b.x + b.w * 0.5, cy = fb.y + fb.h * 0.5;
          var html = '<div class="parts"><div><b>NBSAP · Target 1</b>' +
            FIELDS.map(function (f) { return "<span>" + f + "</span>"; }).join("") +
            '</div><div><b>NDC · water target</b>' +
            FIELDS.map(function (f) { return "<span>" + f + "</span>"; }).join("") + "</div></div>";
          labs.push(label(cx, cy, html, "sl-center"));
        }
      } else if (k === 10) {
        var tg = fieldGroups(TONES.map(function (t) { return t[1]; }), fb);
        var seenT = [0, 0, 0, 0];
        pairs.forEach(function (p, pi) {
          var pos = fieldPos(tg[p.tone], seenT[p.tone]++, fb);
          place(P1, pi, pos[0], pos[1], tg[p.tone].pitch * 0.34, 1, TONES[p.tone][2]);
        });
        var total = pairs.length;
        var row = TONES.map(function (t) {
          var pct = (100 * t[1]) / total;
          var txt = pct < 1 ? "&lt;1%" : Math.round(pct) + "%";
          return '<span class="key" style="background:' + t[2] + '"></span><span class="n">' + txt + "</span> " + t[0];
        }).join('<span class="gap"></span>');
        labs.push(label(b.x, fb.y + fb.h + 12, row, "sl-legend"));
      } else {
        // Recurring themes: aligned on the upper band, potential misalignment below.
        var upper = { x: fb.x, y: fb.y + 26, w: fb.w, h: fb.h * 0.52 - 26 };
        var lower = { x: fb.x, y: fb.y + fb.h * 0.52 + 44, w: fb.w * 0.6, h: fb.h * 0.48 - 44 };
        var ga = fieldGroups(THEMES_ALIGNED.map(function (t) { return t[1]; }), upper);
        var gr = fieldGroups(THEMES_APART.map(function (t) { return t[1]; }), lower);
        var sa = [0, 0, 0, 0], sr = [0, 0, 0, 0];
        pairs.forEach(function (p, pi) {
          if (p.tone === 0) {
            var pos = fieldPos(ga[p.theme], sa[p.theme]++, upper);
            place(P1, pi, pos[0], pos[1], ga[p.theme].pitch * 0.34, 1, p.theme === 3 ? GREEN_LIGHT : GREEN);
          } else if (p.tone === 2) {
            var pos2 = fieldPos(gr[p.theme], sr[p.theme]++, lower);
            place(P1, pi, pos2[0], pos2[1], gr[p.theme].pitch * 0.34, 1, p.theme === 3 ? RED_LIGHT : RED);
          } else {
            place(P1, pi, P0.x[pi], P0.y[pi], P0.r[pi], 0, P0.c[pi] || GREY);
          }
        });
        ga.forEach(function (g, gi) {
          labs.push(label(g.x0, upper.y - 22, gi < 3 ? '<span class="n">' + (gi + 1) + "</span>" : "Other", "sl-num"));
        });
        gr.forEach(function (g, gi) {
          labs.push(label(g.x0, lower.y - 22, gi < 3 ? '<span class="n">' + (gi + 1) + "</span>" : "Other", "sl-num"));
        });
        var lx = b.x + b.w * 0.64;
        var list = function (items) {
          return items.slice(0, 3).map(function (t, i) {
            return "<li><span class=\"n\">" + (i + 1) + "</span> " + t[0] + " <span class=\"c\">" + fmt(t[1]) + "</span></li>";
          }).join("");
        };
        labs.push(label(lx, lower.y - 4, '<ol class="themes apart">' + list(THEMES_APART) + "</ol>", "sl-list"));
        labs.push(label(b.x, fb.y - 12, '<ol class="themes aligned">' + list(THEMES_ALIGNED) + "</ol>", "sl-list sl-top"));
      }
    }
    if (k < 7 || k > 12) {
      pairs.forEach(function (p, pi) {
        var s = spring[pi];
        var ax = T1.x[s[0]], ay = T1.y[s[0]], bx = T1.x[s[1]], by = T1.y[s[1]];
        place(P1, pi, (ax + bx) / 2, (ay + by) / 2, 0.6, 0, P0.c[pi] || GREY);
      });
      pairAlpha = 0;
    }
    if (k === 4 || k === 12) {
      labs.push(label(b.x, b.y - 58, '<span class="person" aria-hidden="true"></span>', "sl-human"));
    }
    return { labels: labs, pairs: pairAlpha };
  }

  // ── Drawing ────────────────────────────────────────────────────────
  function drawLines(alpha) {
    if (alpha <= 0.01) return;
    var b = box(), colW = b.w / DOCS.length, r = seeded(31);
    ctx.globalAlpha = alpha;
    for (var di = 0; di < DOCS.length; di++) {
      var x = b.x + di * colW + 6, w = colW - 18;
      for (var li = 0; li < 18; li++) {
        var lw = w * (0.55 + r() * 0.42), y = b.y + 34 + li * 11;
        var setAside = li >= 13;
        ctx.fillStyle = lines.kept ? (setAside ? LINE : LINE_DARK) : LINE_DARK;
        ctx.fillRect(x, y, lw, 3.5);
      }
    }
    ctx.globalAlpha = 1;
  }

  function lerp(a, b, e) { return a + (b - a) * e; }

  function draw(p) {
    var e = 1 - Math.pow(1 - p, 3);
    // Labels arrive as the dots settle, on the same clock.
    if (labelsEl) labelsEl.style.opacity = String(Math.max(0, Math.min(1, (p - 0.45) / 0.55)));
    var dpr = Math.max(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawLines(lerp(lines.a0, lines.a1, e));

    // Pairs, batched by colour.
    var batches = {};
    for (var i = 0; i < pairs.length; i++) {
      var a = lerp(P0.a[i], P1.a[i], e);
      if (a < 0.02) continue;
      var key = P1.c[i] + "|" + (Math.round(a * 10) / 10);
      (batches[key] = batches[key] || []).push(i);
    }
    Object.keys(batches).forEach(function (key) {
      var parts = key.split("|");
      ctx.fillStyle = parts[0];
      ctx.globalAlpha = parseFloat(parts[1]);
      ctx.beginPath();
      batches[key].forEach(function (i) {
        var x = lerp(P0.x[i], P1.x[i], e), y = lerp(P0.y[i], P1.y[i], e), r = Math.max(0.5, lerp(P0.r[i], P1.r[i], e));
        if (r >= 1.1) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
        else ctx.rect(x - r, y - r, 2 * r, 2 * r);
      });
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Targets.
    for (var t = 0; t < targets.length; t++) {
      var ta = lerp(T0.a[t], T1.a[t], e);
      if (ta < 0.02) continue;
      var tx = lerp(T0.x[t], T1.x[t], e), ty = lerp(T0.y[t], T1.y[t], e), tr = lerp(T0.r[t], T1.r[t], e);
      ctx.globalAlpha = ta;
      ctx.fillStyle = T1.c[t];
      ctx.beginPath();
      ctx.arc(tx, ty, Math.max(1, tr), 0, Math.PI * 2);
      ctx.fill();
      if (ring[t]) {
        ctx.lineWidth = ring[t] === 3 ? 2 : 1;
        ctx.strokeStyle = ring[t] === 2 ? HUMAN : ring[t] === 3 ? BLUE : GREEN;
        ctx.beginPath();
        ctx.arc(tx, ty, Math.max(1, tr) + (ring[t] === 3 ? 4 : 2.5), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function copy(from, to) {
    to.x.set(from.x); to.y.set(from.y); to.r.set(from.r); to.a.set(from.a);
    for (var i = 0; i < from.c.length; i++) to.c[i] = from.c[i];
  }

  function freeze(p) {
    // Where every particle is now becomes the start of the next move.
    var e = 1 - Math.pow(1 - p, 3);
    for (var i = 0; i < targets.length; i++) {
      T0.x[i] = lerp(T0.x[i], T1.x[i], e); T0.y[i] = lerp(T0.y[i], T1.y[i], e);
      T0.r[i] = lerp(T0.r[i], T1.r[i], e); T0.a[i] = lerp(T0.a[i], T1.a[i], e); T0.c[i] = T1.c[i];
    }
    for (var j = 0; j < pairs.length; j++) {
      P0.x[j] = lerp(P0.x[j], P1.x[j], e); P0.y[j] = lerp(P0.y[j], P1.y[j], e);
      P0.r[j] = lerp(P0.r[j], P1.r[j], e); P0.a[j] = lerp(P0.a[j], P1.a[j], e); P0.c[j] = P1.c[j];
    }
    lines.a0 = lerp(lines.a0, lines.a1, e);
  }

  var progress = 1;
  function run() {
    cancelAnimationFrame(frame);
    if (reduce) { progress = 1; draw(1); return; }
    start = 0;
    var tick = function (now) {
      if (!start) start = now;
      progress = Math.min(1, (now - start) / 1300);
      draw(progress);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  function showLabels(list) {
    labelsEl.innerHTML = list
      .map(function (l) {
        return '<div class="sl ' + l.cls + '" style="left:' + l.x.toFixed(1) + "px;top:" + l.y.toFixed(1) + 'px">' + l.html + "</div>";
      })
      .join("");
  }

  function showCaption(k) {
    var c = CAPTIONS[k] || ["", ""];
    capEl.innerHTML = '<p class="sc-phase">' + c[0] + '</p><p class="sc-text">' + c[1] + "</p>";
  }

  function go(k) {
    if (!canvas) return;
    if (step >= 0) freeze(progress);
    step = k;
    var s = sceneFor(k);
    showCaption(k);
    showLabels(s.labels);
    run();
  }

  function resize() {
    W = wrap.clientWidth; H = wrap.clientHeight;
    if (step < 0) return;
    freeze(1);
    var s = sceneFor(step);
    copy(T1, T0); copy(P1, P0); lines.a0 = lines.a1;
    showLabels(s.labels);
    progress = 1;
    draw(1);
  }

  function init() {
    wrap = document.getElementById("mapwrap");
    canvas = document.getElementById("scene");
    labelsEl = document.getElementById("sceneLabels");
    capEl = document.getElementById("sceneCap");
    if (!wrap || !canvas) return;
    ctx = canvas.getContext("2d");
    W = wrap.clientWidth; H = wrap.clientHeight;
    // Everything starts as faint text: the first scene grows out of it.
    var b = box();
    targets.forEach(function (t, i) { place(T0, i, b.x + b.w / 2, b.y + 200, 1, 0, INK); });
    pairs.forEach(function (p, i) { place(P0, i, b.x + b.w / 2, b.y + b.h / 2, 0.6, 0, GREY); });
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(wrap);
    else window.addEventListener("resize", resize);
  }

  window.MethodScene = { init: init, go: go, refresh: function () { if (step >= 0) go(step); } };
})();
