# Self-hosted typefaces

Source Serif 4 and Source Sans 3 (SIL Open Font License 1.1), variable-weight
woff2 subsets copied unmodified from the Fontsource npm packages:

- `@fontsource-variable/source-serif-4@5.2.9` → `files/source-serif-4-{latin,cyrillic,cyrillic-ext}-wght-normal.woff2`
- `@fontsource-variable/source-sans-3@5.2.9` → `files/source-sans-3-{latin,cyrillic,cyrillic-ext}-wght-normal.woff2` and `files/source-sans-3-{latin,cyrillic}-wght-italic.woff2`

The `@font-face` declarations live in `src/app/globals.css` (the app) and in
`public/methodology-experience.html` (standalone page rendered in an iframe);
both point at these same files so the browser cache is shared.

Notes:

- `unicode-range` splitting keeps an English or Spanish visit down to the two
  latin files (~80 KB). Mongolian Cyrillic requires both `cyrillic` AND
  `cyrillic-ext`: the common letters Ө/ө (U+04E8/04E9) and Ү/ү (U+04AE/04AF)
  live in the ext block.
- The serif ships roman-only by design; `font-synthesis-style: none` on `body`
  prevents faux obliques. The sans carries latin + cyrillic italics for quoted
  matter.
- To update: bump the package version, re-copy the files, keep these names.
