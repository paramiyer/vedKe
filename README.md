# vedKe

## Image Karaoke Setup

### Frontend setup (React + Vite)
From repo root:

```bash
cd apps/web
npm install
```

This installs the MVP dependencies including:
- `file-saver` + `@types/file-saver` for JSON download
- `use-resize-observer` for overlay alignment on resize

Run locally:

```bash
npm run dev
```

### Routes
- `/` list of available slugs
- `/suktas/:slug` image-first karaoke playback
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
