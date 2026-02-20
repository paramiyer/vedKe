#!/usr/bin/env bash
set -euo pipefail

cat <<'TEXT'
CodeGraph-first repo map generation:
1) Open this repo in VS Code.
2) Use CodeGraph command palette action to generate/export repo summary.
3) Save concise output (~30 bullets) to repo_map.md.

Fallback mode is running now to generate a minimal repo_map.md.
TEXT

{
  echo '# REPO_MAP'
  echo
  echo '## Top-level structure'
  echo '- `AGENTS.md`: working rules and cost-control guidance.'
  echo '- `agent.md`: pointer to `AGENTS.md` + `repo_map.md`.'
  echo '- `docs/SETUP.md`: install prerequisites and libass font notes.'
  echo '- `docs/ADD_SUKTA.md`: add-sukta and pipeline usage guide.'
  echo '- `docs/FONT_NOTES.md`: Devanagari font reproducibility notes.'
  echo '- `tools/gen_repo_map.sh`: CodeGraph-first + fallback repo map generator.'
  echo '- `assets/fonts/`: bundled fonts (`.ttf/.otf`) for consistent subtitle rendering.'
  echo '- `assets/images/`: optional shared image dump for development.'
  echo '- `assets/audio/`: optional shared audio dump for development.'
  echo '- `apps/web/`: React + Vite + TypeScript app (skeleton in this phase).'
  echo '- `packages/core/`: shared TS contracts/schemas (skeleton in this phase).'
  echo '- `services/aligner/`: local Python CLI services (skeleton in this phase).'
  echo '- `data/manifest.json`: sukta catalog used by the web app.'
  echo '- `data/suktas/<id>/`: per-sukta data contract root.'
  echo '- `out/`: optional top-level rendered output copy location.'
  echo
  echo '## Per-sukta contract'
  echo '- `data/suktas/<id>/input/audio/`: input mp3/wav.'
  echo '- `data/suktas/<id>/input/images/`: lyric scans (png/jpg/pdf).'
  echo '- `data/suktas/<id>/input/text/text_deva.txt`: canonical Devanagari text.'
  echo '- `data/suktas/<id>/work/syllables.json`: extracted syllable units.'
  echo '- `data/suktas/<id>/work/marks.json`: manual boundary marks.'
  echo '- `data/suktas/<id>/work/timings.json`: syllable timings.'
  echo '- `data/suktas/<id>/out/karaoke.ass`: ASS karaoke subtitle file.'
  echo '- `data/suktas/<id>/out/render.mp4`: final rendered karaoke video.'
  echo
  echo '## Sample suktas'
  for d in data/suktas/*; do
    [ -d "$d" ] || continue
    echo "- \`$d\`: sample sukta scaffold with input/work/out folders."
  done
} > repo_map.md

echo 'Generated fallback repo_map.md'
