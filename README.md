# vedKe

End-to-end pipeline for Vedic `.itx` text to React-rendered visual karaoke assets.

This README is written as an operator guide so you can onboard future suktas by uploading:
- one `.itx` file (source text)
- one `.pdf` file (matching visual/text layer)

and render in the web app with token-level highlighting.

## What Gets Built

For a slug `<slug>`, pipeline outputs:

```text
build/<slug>/tokens.json
build/<slug>/karaoke.json
build/<slug>/visual/visual.json
build/<slug>/visual/highlights.json
build/<slug>/visual/pages/page-001.svg
...
```

Then `sync-web` copies them to:

```text
apps/web/public/suktas/<slug>/
  tokens.json
  karaoke.json
  visual/visual.json
  visual/highlights.json
  visual/pages/page-*.svg
```

## Data Flow (Source of Truth)

1. `.itx` -> `tokens.json`
2. `tokens.json` -> `karaoke.json` (line grouping + `joinToNext`)
3. `.itx` / `.pdf` -> `visual/visual.json` + SVG pages
4. `karaoke.json` + PDF text-layer bboxes -> `visual/highlights.json`
5. `build/*` -> `apps/web/public/suktas/<slug>/*`

Important:
- `karaoke.json` is the source-of-truth token stream.
- `highlights.json` is aligned to `karaoke.json` token IDs and includes `kind` (`word`/`punct`).

## Prerequisites

### Python
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

### System tools
- `itrans`
- `pdflatex`
- `pdftocairo`
- `pdfinfo`
- `pdftotext`

macOS (Poppler tools):
```bash
brew install poppler
```

## One-Command Reusable Pipeline (Recommended)

For any future sukta:

```bash
python3 -m services.itx_pipeline build-pipeline \
  --slug <slug> \
  --itx data/suktas/<name>.itx \
  --pdf data/suktas/<name>.pdf \
  --out build/<slug> \
  --web apps/web/public/suktas/<slug>
```

This runs, in order:
1. `build-tokens`
2. `build-karaoke`
3. `build-visual`
4. `build-highlights`
5. `sync-web`

## Step-by-Step Pipeline (If You Want Manual Control)

```bash
python3 -m services.itx_pipeline build-tokens \
  --slug <slug> \
  --itx data/suktas/<name>.itx \
  --out build/<slug>

python3 -m services.itx_pipeline build-karaoke \
  --tokens build/<slug>/tokens.json \
  --out build/<slug>

python3 -m services.itx_pipeline build-visual \
  --slug <slug> \
  --itx data/suktas/<name>.itx \
  --out build/<slug>

python3 -m services.itx_pipeline build-highlights \
  --slug <slug> \
  --karaoke build/<slug>/karaoke.json \
  --pdf data/suktas/<name>.pdf \
  --out build/<slug>

python3 -m services.itx_pipeline sync-web \
  --slug <slug> \
  --build build/<slug> \
  --web apps/web/public/suktas/<slug>
```

## Add a New Sukta (Checklist)

1. Place files:
   - `data/suktas/<name>.itx`
   - `data/suktas/<name>.pdf`
2. Choose slug:
   - e.g. `mrityunjaya`
3. Run one-command pipeline:
   - `build-pipeline` command above
4. Add slug to web manifest:
   - `apps/web/public/suktas/manifest.json`
5. Start frontend and verify routes:
   - `/suktas/<slug>`
   - `/slugs/<slug>/visual`

## Frontend Run

```bash
cd apps/web
npm install
npm run dev
```

Routes:
- `/` slug list
- `/suktas/:slug` text preview from `karaoke.json`
- `/slugs/:slug/visual` SVG visual rendering + token highlight playback

## Validation and Accuracy Checks

Use these quick checks after build:

### 1) Token parity (`karaoke.json` vs `highlights.json`)
```bash
python3 - <<'PY'
import json
from pathlib import Path
slug = "ganapati"
k = json.loads(Path(f"build/{slug}/karaoke.json").read_text(encoding="utf-8"))
h = json.loads(Path(f"build/{slug}/visual/highlights.json").read_text(encoding="utf-8"))
k_ids = [t["id"] for line in k["lines"] for t in line["tokens"]]
h_ids = [r["id"] for p in sorted(h["pages"], key=lambda x:int(x)) for r in h["pages"][p]]
print("karaoke:", len(k_ids), "highlights:", len(h_ids))
print("missing:", len(set(k_ids)-set(h_ids)), "extra:", len(set(h_ids)-set(k_ids)))
print("positional_similarity_%:", 100.0 * sum(1 for i in range(min(len(k_ids),len(h_ids))) if k_ids[i]==h_ids[i]) / max(1,min(len(k_ids),len(h_ids))))
PY
```

Expected:
- counts equal
- missing/extra == 0
- positional similarity near 100%

### 2) Kind parity (`word`/`punct`)
```bash
python3 - <<'PY'
import json
from pathlib import Path
slug = "ganapati"
k = json.loads(Path(f"build/{slug}/karaoke.json").read_text(encoding="utf-8"))
h = json.loads(Path(f"build/{slug}/visual/highlights.json").read_text(encoding="utf-8"))
k_kind = {t["id"]: t["kind"] for line in k["lines"] for t in line["tokens"]}
bad = []
for page in h["pages"].values():
  for r in page:
    if k_kind.get(r["id"]) != r.get("kind"):
      bad.append(r["id"])
print("kind_mismatch:", len(bad))
PY
```

Expected:
- `kind_mismatch: 0`

## How Highlight Alignment Works (No OCR / No ML)

Current `build-highlights` implementation:
- extracts word bboxes from PDF text layer with `pdftotext -bbox-layout`
- normalizes Devanagari text/marks/digits
- splits compound punctuation-digit words (e.g. `॥14॥`)
- applies token-vocabulary-guided split for merged PDF words
- runs monotonic dynamic-programming sequence alignment to map to `karaoke.json` token IDs
- writes `highlights.json` including `id`, `kind`, `x`, `y`, `w`, `h`, `label`

## Troubleshooting

### Error: missing tool (`pdftotext`, `pdftocairo`, `pdfinfo`)
Install Poppler and re-run.

### Error: `Could not fully align tokens`
Pipeline now fails if any token is unmatched.
Check:
- PDF corresponds exactly to the same text as `.itx`
- PDF has extractable text layer (not scanned image-only)
- font/text normalization differences in source

### Visual route shows no new updates
- Hard refresh browser.
- Ensure you ran `sync-web`.
- Check `apps/web/public/suktas/<slug>/visual/highlights.json` timestamp/content.

### `manifest.json` does not list new slug
Add slug to:
- `apps/web/public/suktas/manifest.json`

## Python Tests

If dependencies are installed:

```bash
python3 -m pytest
```

## Notes

- `/annotate` is dev-only tooling and optional.
- Audio alignment is intentionally separate from this build pipeline.
- This pipeline focuses on text/visual tokenization and rendering first.
