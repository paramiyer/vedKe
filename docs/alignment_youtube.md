# Audio Alignment Pipeline (YouTube -> Token Timings)

## Prereqs (macOS)

1. Python 3.10+
2. ffmpeg
3. yt-dlp
4. (Optional) whisperx for word-level forced alignment

Install example:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m pip install yt-dlp
brew install ffmpeg
# Optional aligner:
# python -m pip install whisperx==3.1.1
```

## Fetch audio from YouTube

```bash
python scripts/fetch_youtube_audio.py \
  --url "https://youtu.be/m2dPpGzywnQ?si=rgYA07hELdmmsACo" \
  --out data/audio/source.mp3
```

## Run alignment

```bash
python scripts/align_audio.py \
  --tokens build/ganapati/tokens.json \
  --highlighter apps/web/public/suktas/ganapati/visual/highlights.json \
  --audio data/audio/source.mp3 \
  --out data/alignment/timings.json \
  --engine whisperx
```

If `whisperx` is unavailable or low-confidence, the script automatically falls back to deterministic segment-based timing.

## Validate alignment

```bash
python scripts/validate_alignment.py \
  --tokens build/ganapati/tokens.json \
  --highlighter apps/web/public/suktas/ganapati/visual/highlights.json \
  --timings data/alignment/timings.json
```

## Make targets

```bash
make fetch_audio URL="https://youtu.be/m2dPpGzywnQ?si=rgYA07hELdmmsACo"
make align_audio TOKENS=build/ganapati/tokens.json HIGHLIGHTER=apps/web/public/suktas/ganapati/visual/highlights.json
make validate_alignment TOKENS=build/ganapati/tokens.json HIGHLIGHTER=apps/web/public/suktas/ganapati/visual/highlights.json
```
