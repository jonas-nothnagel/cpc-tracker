/**
 * Annotate the live briefing with what each workstream changed.
 *
 * Draws a labelled outline around every region this branch touched, then
 * screenshots it. Used to review the change set visually rather than by
 * reading a diff.
 *
 *   node scripts/annotate-changes.mjs <url> <outfile>
 *
 * Not a test. `pnpm test` owns the assertions; this is for looking at.
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:3000/en/panama";
const out = process.argv[3] ?? "/tmp/annotated.png";
const exe = process.env.CHROMIUM_PATH;

/** One entry per changed region. `find` runs in the page. */
const REGIONS = [
  {
    ws: "WS1",
    color: "#0468b1",
    label: "Documents grouped by national hierarchy",
    find: () => document.querySelector('[data-tour="doc-toggle"]'),
  },
  {
    ws: "WS3",
    color: "#be185d",
    label: "Nine sections regrouped into four named stages",
    find: () => document.querySelector("nav.sticky"),
  },
  {
    ws: "WS2",
    color: "#0d9488",
    label: "Always-on reading line + glossary terms",
    find: () =>
      [...document.querySelectorAll("section#direction p")].find((p) =>
        p.querySelector("button.decoration-dotted"),
      ) ?? document.querySelector("section#direction p.text-caption"),
  },
  {
    ws: "WS2",
    color: "#0d9488",
    label: "Walkthrough trigger now labelled",
    labelPos: "right",
    find: () =>
      [...document.querySelectorAll("button")].find((b) =>
        /how to read this chart|cómo leer/i.test(b.getAttribute("aria-label") ?? ""),
      ),
  },
  {
    ws: "Targets",
    color: "#0f766e",
    label: "Front door: every document and its target count",
    find: () => {
      const p = [...document.querySelectorAll("p")].find((x) =>
        /Browse the commitments|Explore los compromisos/.test(x.textContent ?? ""),
      );
      return p ? p.parentElement : null;
    },
  },
];

const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1500, height: 1150 } });
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-tour="doc-toggle"]', { timeout: 120_000 });
await page.waitForTimeout(2500);

const drawn = await page.evaluate((regions) => {
  const found = [];
  const layer = document.createElement("div");
  layer.style.cssText =
    "position:absolute;inset:0;z-index:2147483000;pointer-events:none;";
  document.body.appendChild(layer);

  regions.forEach((region) => {
    // eslint-disable-next-line no-new-func
    const el = new Function(`return (${region.find})()`)();
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const top = r.top + window.scrollY;
    const left = r.left + window.scrollX;

    const box = document.createElement("div");
    box.style.cssText = `position:absolute;top:${top - 6}px;left:${left - 6}px;width:${
      r.width + 12
    }px;height:${r.height + 12}px;border:2.5px solid ${region.color};border-radius:8px;
      background:${region.color}0F;box-shadow:0 0 0 3px ${region.color}22;`;

    const tag = document.createElement("div");
    tag.textContent = `${region.ws} · ${region.label}`;
    // Flip the label below the box when it would run off the top of the page.
    // Default above the box; flip below at the top of the page, and allow a
    // region to opt into a side label where an above/below one would collide
    // with a neighbouring annotation.
    const above = top - 6 > 26;
    const place =
      region.labelPos === "right"
        ? `top:-2px;left:${r.width + 18}px`
        : `${above ? "top:-24px" : "bottom:-24px"};left:-2px`;
    tag.style.cssText = `position:absolute;${place};
      background:${region.color};color:#fff;font:600 12px/1.6 ui-sans-serif,system-ui,sans-serif;
      padding:1px 8px;border-radius:5px;white-space:nowrap;`;
    box.appendChild(tag);
    layer.appendChild(box);
    found.push(`${region.ws}: ${region.label}`);
  });
  return found;
}, REGIONS.map((r) => ({ ...r, find: r.find.toString() })));

console.log("annotated regions:");
drawn.forEach((d) => console.log("  -", d));

await page.screenshot({ path: out, fullPage: process.env.FULL_PAGE === "1" });
console.log("wrote", out);
await browser.close();
