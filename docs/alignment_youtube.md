# Audio Alignment Pipeline (YouTube -> Token Timings)

## Prereqs (macOS)

1. Python 3.12 (via `uv`)
2. ffmpeg
3. (Optional) whisperx for word-level forced alignment

Install example:

```bash
uv python install 3.12
uv venv --python 3.12
uv sync
brew install ffmpeg
# Optional aligner:
# uv pip install whisperx==3.1.1
```

## Fetch audio from YouTube

```bash
uv run python scripts/fetch_youtube_audio.py \
  --url "https://youtu.be/m2dPpGzywnQ?si=rgYA07hELdmmsACo" \
  --out data/audio/source.mp3
```

## Run alignment

```bash
uv run python scripts/align_audio.py \
  --tokens build/ganapati/tokens.json \
  --highlighter apps/web/public/suktas/ganapati/visual/highlights.json \
  --audio data/audio/source.mp3 \
  --out data/alignment/timings.json \
  --engine whisperx
```

If `whisperx` is unavailable or low-confidence, the script automatically falls back to deterministic segment-based timing.
If `ffprobe` is unavailable, pass `--duration-ms <N>` to run fallback mode offline.

## Validate alignment

```bash
uv run python scripts/validate_alignment.py \
  --tokens build/ganapati/tokens.json \
  --highlighter apps/web/public/suktas/ganapati/visual/highlights.json \
  --timings data/alignment/timings.json
```

## Anchor-Based Auto Correction (Semi-Automated)

If playback is consistently early/late in regions, capture a few anchors (token index + current audio time in ms) and save:

`data/alignment/anchors.json`
```json
{
  "anchors": [
    { "token_index": 0, "audio_time_ms": 4200 },
    { "token_index": 140, "audio_time_ms": 68400 },
    { "token_index": 320, "audio_time_ms": 143900 }
  ]
}
```

Then regenerate corrected timings automatically:

```bash
uv run python -m services.itx_pipeline retime-with-anchors \
  --timings data/alignment/timings.json \
  --anchors data/alignment/anchors.json \
  --out data/alignment/timings.retimed.json
```

## Fast Global Offset Fix (when lead/lag is roughly constant)

If highlight is ahead by `N` tokens, delay all timings by using a positive offset:

```bash
uv run python -m services.itx_pipeline retime-with-offset \
  --timings apps/web/public/suktas/ganapati/timings.json \
  --offset-tokens 11 \
  --out apps/web/public/suktas/ganapati/timings.json
```

Rules:
- highlight ahead -> use positive offset (`+10` to `+12`)
- highlight behind -> use negative offset (`-10` to `-12`)

## Make targets

```bash
make fetch_audio URL="https://youtu.be/m2dPpGzywnQ?si=rgYA07hELdmmsACo"
make align_audio TOKENS=build/ganapati/tokens.json HIGHLIGHTER=apps/web/public/suktas/ganapati/visual/highlights.json
make retime_with_anchors TIMINGS=data/alignment/timings.json ANCHORS=data/alignment/anchors.json RETIMED=data/alignment/timings.retimed.json
make retime_with_offset TIMINGS=apps/web/public/suktas/ganapati/timings.json OFFSET_TOKENS=11 RETIMED=apps/web/public/suktas/ganapati/timings.json
make validate_alignment TOKENS=build/ganapati/tokens.json HIGHLIGHTER=apps/web/public/suktas/ganapati/visual/highlights.json
```
