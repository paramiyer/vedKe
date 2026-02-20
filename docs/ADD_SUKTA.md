# Add a New Sukta

## 1) Create folder
Create `data/suktas/<sukta_id>/` with:
- `input/audio/`
- `input/images/`
- `input/text/`
- `work/`
- `out/`

## 2) Drop input files
- Audio: `input/audio/*.mp3|*.wav`
- Lyric scans: `input/images/*.(png|jpg|pdf)`
- Canonical text: `input/text/text_deva.txt`

## 3) Run extraction first (pipeline phase)
Use `services/aligner/cli_extract_syllables.py` to generate:
- `work/syllables.json`

## 4) Align in web editor (pipeline phase)
- Open the alignment editor for the sukta.
- Mark syllable boundaries while listening.
- Save/export `work/marks.json`.

## 5) Export timings + ASS + MP4 (pipeline phase)
- `cli_editor_export.py` -> `work/timings.json`
- `cli_make_ass.py` -> `out/karaoke.ass`
- `cli_render.py` -> `out/render.mp4`

## Where outputs appear
- Primary: `data/suktas/<sukta_id>/out/render.mp4`
- Optional copies can be placed in top-level `out/`.
