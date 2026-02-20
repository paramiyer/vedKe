# REPO_MAP

## Workspace
- `AGENTS.md`: working rules and cost control guardrails.
- `agent.md`: agent policy reminder; consult `repo_map.md` first.
- `README.md`: Python test setup + image-karaoke setup and workflow docs.
- `requirements.txt`: runtime Python dependencies (currently empty placeholder).
- `requirements-dev.txt`: dev dependencies for local test execution (`pytest`, `pytest-cov`).
- `docs/SETUP.md`: dependency install and optional PDF conversion setup.
- `docs/ADD_SUKTA.md`: legacy per-sukta data contract documentation.
- `docs/FONT_NOTES.md`: rendering consistency notes.
- `tools/gen_repo_map.sh`: fallback repo map generator.
- `tools/pdf_to_png.py`: optional PDF -> PNG utility via `pdf2image`.

## Frontend app (`apps/web`)
- `apps/web/package.json`: React+Vite scripts and dependencies.
- `apps/web/index.html`: Vite HTML entry.
- `apps/web/vite.config.ts`: Vite config with React plugin.
- `apps/web/tsconfig.json`: strict TypeScript config for web code.
- `apps/web/src/main.tsx`: React root + router bootstrap + global stylesheet load.
- `apps/web/src/App.tsx`: route table and dev-tool route gating, slug list loaded from manifest with fallback.
- `apps/web/src/styles.css`: bundled Devanagari webfont `@font-face` declarations and `.vedicText` renderer class.
- `apps/web/src/types/annotations.ts`: `AnnotationItem`, `AnnotationsFile`, `PlayerState`.
- `apps/web/src/lib/annotations.ts`: schema validation, load, URL helpers, JSON formatter.
- `apps/web/src/lib/devtoolsGate.ts`: `/annotate` visibility gate (`VITE_DEV_TOOLS` or localStorage).
- `apps/web/src/lib/suktaManifest.ts`: loads `/suktas/manifest.json` with fallback `["sample"]`.
- `apps/web/src/components/AudioPlayer.tsx`: HTMLAudioElement wrapper with rAF time stream.
- `apps/web/src/components/TimelineScrubber.tsx`: reusable seek slider.
- `apps/web/src/components/ImageKaraokeViewer.tsx`: responsive image + SVG bbox overlay.
- `apps/web/src/components/SanskritRenderer.tsx`: HTML Sanskrit renderer for `karaoke.json`, join-aware token spacing, codepoint/font debug toggles, and font self-test.
- `apps/web/src/routes/SuktaKaraokePage.tsx`: `/suktas/:slug` route loader for karaoke JSON + renderer host.
- `apps/web/src/routes/VisualPage.tsx`: `/slugs/:slug/visual` SVG page preview with scalable highlight overlays and local annotation export; defaults to page 2 (or second page entry) when available, loads `karaoke.json`, supports token-focused highlighting/mapping while annotating, colorizes text pixels in mapped regions (instead of only showing solid boxes), and provides play/pause token stepping at configurable tokens/sec.
- `apps/web/src/routes/AnnotatePage.tsx`: `/annotate` bbox draw + timing tap + export/import.
- `apps/web/public/fonts/*.woff2`: locally bundled Noto Devanagari webfonts used by `.vedicText`.
- `apps/web/public/suktas/manifest.json`: web-visible slug registry editable without code changes.

## Routing
- `/`: minimal home with sample slug links.
- `/suktas/:slug`: loads `/suktas/:slug/karaoke.json` and renders selectable HTML Devanagari text with Vedic diagnostics.
- `/slugs/:slug/visual`: loads `visual.json` + SVG pages for PDF-faithful text rendering checks.
- `/annotate`: dev-only annotation editor.

## Image-first assets
- `assets/suktas/<slug>/`: single-image + single-audio karaoke contract.
- `assets/suktas/sample/image.png`: placeholder image used by MVP viewer/tool.
- `assets/suktas/sample/audio.mp3`: placeholder audio used by MVP viewer/tool.
- `assets/suktas/sample/annotations.json`: sample bbox + timing data.
- `assets/fonts/`: optional project font pinning.
- `assets/images/`: legacy shared image dump.
- `assets/audio/`: legacy shared audio dump.

## Legacy/parallel pipeline
- `data/manifest.json`: legacy sukta manifest.
- `data/suktas/<id>/...`: previous text-first extraction/alignment structure.
- `packages/core/`: placeholder shared TS package.
- `services/aligner/`: placeholder Python service package.
- `services/__init__.py`: marks `services` as an importable package root.
- `services/itx_pipeline/__main__.py`: module entrypoint for `python -m services.itx_pipeline`.
- `services/itx_pipeline/cli.py`: CLI surface for `build-tokens`, `validate-tokens`, `audit-charset`, `build-karaoke`, `build-visual`, `build-highlights`, and `sync-web`.
- `services/itx_pipeline/visual.py`: visual pipeline (`.itx` -> PDF via itrans/pdflatex -> SVG pages via pdftocairo) and `visual.json` generation.
- `services/itx_pipeline/highlights.py`: word-level visual highlight pipeline (PDF text-layer bboxes via `pdftotext`, sequential token alignment against `karaoke.json`, and `visual/highlights.json` generation).
- `services/itx_pipeline/parser.py`: `.itx` content filtering, ITX->Devanagari conversion, tokenization, and tokens.json writer.
- `services/itx_pipeline/validation.py`: token validation rules, audit reporting, and charset diagnostics.
- `services/itx_pipeline/karaoke.py`: CP2 builder that converts tokens.json into line-grouped karaoke.json with join metadata and payload validation.
- `services/itx_pipeline/sync_web.py`: copies build artifacts (including `visual/` SVG pages + manifests) to `apps/web/public/suktas/<slug>` for Vite static serving.
- `tests/test_itx_pipeline.py`: pytest coverage for line filtering, svara handling, deterministic IDs, and file output.
- `tests/test_karaoke_builder.py`: pytest coverage for line grouping, svara-preserving output, and joinToNext behavior.
- `tests/test_sync_web.py`: pytest coverage for sync copy behavior with and without optional assets.
- `tests/test_visual_builder.py`: pytest coverage for SVG dimension extraction and visual manifest generation.
- `tests/test_highlights_builder.py`: pytest coverage for pdftotext bbox parsing, normalization-aware token alignment, and highlights payload scaling.
- `tests/fixtures/sample.itx`: fixture input used by pipeline tests.
- `tests/fixtures/sample_page.svg`: fixture SVG used by visual manifest tests.
- `out/`: generated output staging area.
