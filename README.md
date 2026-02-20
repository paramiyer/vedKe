# vedKe

## Python Test Setup
Create and activate a virtual environment, install runtime + dev dependencies, then run tests:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
python -m pytest
```

## Image Karaoke Setup

### Visual-first build (.itx -> PDF -> SVG pages)
From repo root:

```bash
python -m services.itx_pipeline build-visual \
  --slug ganapati \
  --itx data/suktas/ganapatiaccent.itx \
  --out build/ganapati
```

This writes:

```text
build/ganapati/visual/visual.json
build/ganapati/visual/highlights.json
build/ganapati/visual/pages/page-001.svg
...
```

To serve from React, sync build assets into Vite public:

```bash
python -m services.itx_pipeline sync-web \
  --slug ganapati \
  --build build/ganapati \
  --web apps/web/public/suktas/ganapati
```

### CP pipeline to web (tokens -> karaoke -> sync)
From repo root:

```bash
python3 -m services.itx_pipeline build-tokens \
  --slug ganapati \
  --itx data/suktas/ganapatiaccent.itx \
  --out build/ganapati

python3 -m services.itx_pipeline build-karaoke \
  --tokens build/ganapati/tokens.json \
  --out build/ganapati

python3 -m services.itx_pipeline build-highlights \
  --slug ganapati \
  --karaoke build/ganapati/karaoke.json \
  --pdf data/suktas/ganapatiaccent.pdf \
  --out build/ganapati

python3 -m services.itx_pipeline sync-web \
  --slug ganapati \
  --build build/ganapati \
  --web apps/web/public/suktas/ganapati

cd apps/web
npm install
npm run dev
```

### Reusable one-command pipeline for any sukta
From repo root:

```bash
python3 -m services.itx_pipeline build-pipeline \
  --slug <slug> \
  --itx data/suktas/<file>.itx \
  --pdf data/suktas/<file>.pdf \
  --out build/<slug> \
  --web apps/web/public/suktas/<slug>
```

This runs:
1. `build-tokens`
2. `build-karaoke`
3. `build-visual`
4. `build-highlights` (strict token parity against `karaoke.json`)
5. `sync-web`

`apps/web/public/suktas/manifest.json` controls the slug list shown on `/`.
If the manifest is missing/unreadable, the app falls back to `["sample"]`.

### Frontend setup (React + Vite)
From repo root:

```bash
cd apps/web
npm install
npm run dev
```

This installs the MVP dependencies including:
- `file-saver` + `@types/file-saver` for JSON download
- `use-resize-observer` for overlay alignment on resize

### Routes
- `/` list of available slugs
- `/suktas/:slug` HTML Devanagari/Vedic karaoke renderer driven by `karaoke.json`
- `/slugs/:slug/visual` PDF-faithful SVG visual preview + highlight overlay/annotation
- `/annotate` dev-only annotation tool

`/annotate` is available only when either condition is true:
- environment variable `VITE_DEV_TOOLS=true`
- local storage key is set: `localStorage.setItem("veda.devtools", "1")`

### Image-first asset contract
Each sukta lives under:

```text
assets/suktas/<slug>/
  image.png
  audio.mp3
  annotations.json
```

`annotations.json`:

```json
{
  "slug": "sample",
  "image": "image.png",
  "audio": "audio.mp3",
  "w": 1280,
  "h": 720,
  "items": [
    { "id": "w001", "bbox": [120, 180, 320, 250], "t0": 0.0, "t1": 0.8 }
  ]
}
```

### Add a new sukta
1. Create `assets/suktas/<slug>/`.
2. Add one image file and one audio file.
3. Copy or create `annotations.json` with matching `w/h` and `items`.
4. Open `/suktas/<slug>` to verify playback and highlighting.

### Annotation workflow (`/annotate`)
1. Pick a slug from the dropdown.
2. Draw word boxes by click-dragging on the image.
3. Reorder/delete/select items as needed.
4. Play audio and press `Space`:
   - first press sets `t0`
   - second press sets `t1` and auto-advances
5. Fine-tune timings with `±0.05` and `±0.10` controls.
6. Export via `Download annotations.json` or `Copy JSON to clipboard`.
7. Optionally re-import JSON to verify round-trip.

### Optional PDF -> PNG preprocessing utility
A helper script is included:

```bash
python tools/pdf_to_png.py <input.pdf> <output_dir> --dpi 300
```

Install optional dependency:

```bash
pip install pdf2image
```

On macOS install poppler:

```bash
brew install poppler
```

### Tooling prerequisites for visual build
- ITRANS + LaTeX toolchain (`itrans`, `pdflatex`) to produce PDF from `.itx`
- Poppler tools (`pdftocairo`, `pdfinfo`, `pdftotext`) for PDF -> SVG pages and word bbox extraction

Install notes (macOS):

```bash
brew install poppler
```

LaTeX/ITRANS installation varies by setup; ensure `itrans` and `pdflatex` are on `PATH`.

### Known limitations
- `build-visual` shells out to system tools and fails fast with explicit messages when missing.
- Highlight save is local-first (localStorage) with manual JSON export; there is no backend persistence yet.

## Sanskrit Font Rendering (apps/web)
- Fonts are bundled in `apps/web/public/fonts/`:
  - `NotoSerifDevanagari-Devanagari.woff2`
  - `NotoSansDevanagari-Devanagari.woff2`
- The Sanskrit renderer applies these via `.vedicText` in `apps/web/src/styles.css`.
- `/suktas/:slug` renders `apps/web/public/suktas/<slug>/karaoke.json` as selectable HTML text.

### Verify rendering
1. Run `cd apps/web && npm run dev`.
2. Open `/suktas/<slug>`.
3. In the page:
   - enable `Show codepoints` and verify marks exist in token strings.
   - enable `Show font used` and confirm Devanagari font stack is active.
   - inspect `Font support self-test` status for known marks.

### If Vedic marks are missing/misaligned
1. Hard-refresh the browser and retry.
2. Confirm both WOFF2 files are present under `apps/web/public/fonts/`.
3. Check `Show font used`; if fallback fonts are used, glyph coverage may be incomplete.
