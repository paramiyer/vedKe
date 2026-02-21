#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

from services.itx_pipeline.alignment import (
    load_highlighter,
    load_tokens,
    validate_timings_payload,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate token/highlighter/timings index invariants")
    parser.add_argument("--tokens", required=True, help="Path to tokens.json")
    parser.add_argument("--highlighter", required=True, help="Path to highlighter/highlights json")
    parser.add_argument("--timings", required=True, help="Path to timings.json")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _, tokens = load_tokens(Path(args.tokens))
    highlighter = load_highlighter(Path(args.highlighter))
    timings = json.loads(Path(args.timings).read_text(encoding="utf-8"))

    errors = validate_timings_payload(tokens=tokens, highlighter=highlighter, timings_payload=timings)
    if errors:
        print(f"Validation failed with {len(errors)} error(s):")
        for err in errors:
            print(f"- {err}")
        return 1

    print("Alignment validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
