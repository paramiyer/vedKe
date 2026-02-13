# REPO_MAP

## Workspace
- `AGENTS.md`: working rules and cost control guardrails.
- `agent.md`: agent policy reminder; consult `repo_map.md` first.
- `README.md`: image-karaoke setup, routes, annotation workflow.
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
- `apps/web/src/main.tsx`: React root + router bootstrap.
- `apps/web/src/App.tsx`: route table and dev-tool route gating.
- `apps/web/src/types/annotations.ts`: `AnnotationItem`, `AnnotationsFile`, `PlayerState`.
- `apps/web/src/lib/annotations.ts`: schema validation, load, URL helpers, JSON formatter.
- `apps/web/src/lib/devtoolsGate.ts`: `/annotate` visibility gate (`VITE_DEV_TOOLS` or localStorage).
- `apps/web/src/components/AudioPlayer.tsx`: HTMLAudioElement wrapper with rAF time stream.
- `apps/web/src/components/TimelineScrubber.tsx`: reusable seek slider.
- `apps/web/src/components/ImageKaraokeViewer.tsx`: responsive image + SVG bbox overlay.
- `apps/web/src/routes/SuktaKaraokePage.tsx`: `/suktas/:slug` playback screen.
- `apps/web/src/routes/AnnotatePage.tsx`: `/annotate` bbox draw + timing tap + export/import.

## Routing
- `/`: minimal home with sample slug links.
- `/suktas/:slug`: loads `assets/suktas/:slug/annotations.json`, image, and audio.
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
- `out/`: generated output staging area.
