# apps/web

Karaoke frontend built with React + Vite + TypeScript.

## Commands
- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`

## Routes
- `/` sample slug list
- `/suktas/:slug` HTML Sanskrit renderer from `public/suktas/<slug>/karaoke.json`
- `/annotate` dev-only bbox + timing annotation tool

## Slug Manifest
- `public/suktas/manifest.json` controls the home page slug list.
- Fallback behavior: if the manifest is missing or invalid, the app uses `["sample"]`.

## Fonts
- Webfonts live in `public/fonts/`:
  - `NotoSerifDevanagari-Devanagari.woff2`
  - `NotoSansDevanagari-Devanagari.woff2`
- They are applied via `src/styles.css` under the `.vedicText` class and used by the Sanskrit renderer.

## Rendering Verification
- Open `/suktas/<slug>` and verify:
  - Devanagari base letters are rendered (not tofu boxes).
  - Vedic marks (e.g. `॑`, `॒`, `᳚`) are visible on the glyphs.
- Use UI toggles:
  - `Show codepoints` to inspect token-level Unicode points (`U+....`).
  - `Show font used` to inspect computed `font-family`.
  - `Font support self-test` panel to check mark support quickly.

## If marks do not render
- Hard refresh the browser (to clear stale cached CSS/font assets).
- Confirm font files exist at:
  - `/fonts/NotoSerifDevanagari-Devanagari.woff2`
  - `/fonts/NotoSansDevanagari-Devanagari.woff2`
- Check `Show font used`; if custom fonts are missing, browser fallback may not support all marks.
