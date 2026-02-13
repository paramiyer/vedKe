#!/usr/bin/env python3
"""Convert PDF pages to PNG images for image-first karaoke preprocessing."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Convert PDF pages to PNG files using pdf2image.")
    parser.add_argument("pdf_path", type=Path, help="Input PDF file path")
    parser.add_argument("output_dir", type=Path, help="Directory where PNG files will be written")
    parser.add_argument("--dpi", type=int, default=300, help="DPI for conversion (default: 300)")
    parser.add_argument("--first-page", type=int, default=None, help="First page number (1-based)")
    parser.add_argument("--last-page", type=int, default=None, help="Last page number (1-based)")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if not args.pdf_path.exists():
        parser.error(f"PDF not found: {args.pdf_path}")

    try:
        from pdf2image import convert_from_path
    except ImportError:
        print("pdf2image is not installed. Run: pip install pdf2image", file=sys.stderr)
        return 1

    args.output_dir.mkdir(parents=True, exist_ok=True)

    images = convert_from_path(
        str(args.pdf_path),
        dpi=args.dpi,
        first_page=args.first_page,
        last_page=args.last_page,
    )

    stem = args.pdf_path.stem
    for index, image in enumerate(images, start=1):
        out_path = args.output_dir / f"{stem}_{index:03d}.png"
        image.save(out_path, format="PNG")
        print(out_path)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
