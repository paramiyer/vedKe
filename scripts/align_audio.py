#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from services.itx_pipeline.alignment import (
    build_timings,
    load_highlighter,
    load_tokens,
    save_timings,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Align audio to baseline tokens and emit timings.json")
    parser.add_argument("--tokens", required=True, help="Path to tokens.json")
    parser.add_argument("--highlighter", required=True, help="Path to highlighter/highlights json")
    parser.add_argument("--audio", required=True, help="Path to source mp3")
    parser.add_argument("--out", required=True, help="Path to output timings.json")
    parser.add_argument("--engine", default="whisperx", choices=["whisperx", "fallback"], help="Alignment engine")
    parser.add_argument("--url", default="", help="Source URL (stored in output metadata)")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _, tokens = load_tokens(Path(args.tokens))
    highlighter = load_highlighter(Path(args.highlighter))
    payload = build_timings(
        tokens=tokens,
        highlighter=highlighter,
        audio_path=Path(args.audio),
        audio_url=args.url,
        engine=args.engine,
    )
    out_path = save_timings(payload, Path(args.out))
    print(out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
