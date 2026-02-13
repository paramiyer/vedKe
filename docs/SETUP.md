# Setup

## Required
1. Homebrew
2. Python 3.10+
3. `uv` (Python package/project manager)
   - `brew install uv`
4. Node.js 18+ (20+ recommended)

## Web App (Image Karaoke)
From repo root:

```bash
cd apps/web
npm install
npm run dev
```

Installed dependencies include:
- `file-saver` + `@types/file-saver` for client-side JSON download
- `use-resize-observer` for resize-safe overlay alignment

## Python Environment (uv + pyproject.toml)
This repo uses `uv` with `pyproject.toml`.

From repo root:
- `uv sync`

Run Python tools via:
- `uv run python --version`
- `uv run python services/aligner/<script>.py --help`

## Optional: PDF -> PNG for image preprocessing
The script `tools/pdf_to_png.py` uses `pdf2image`.

Install:
- `pip install pdf2image`

macOS requirement:
- `brew install poppler`

Usage:
- `python tools/pdf_to_png.py input.pdf output_dir --dpi 300`

## Optional (Devanagari/Vedic Rendering)
Install at least one Devanagari-capable font locally:
- Noto Sans Devanagari
- Sanskrit 2003

Also supported:
- Drop reproducible project fonts in `assets/fonts/` (`.ttf`/`.otf`).
