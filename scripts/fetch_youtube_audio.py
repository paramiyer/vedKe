#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path


def require_tool(name: str, install_hint: str) -> None:
    if shutil.which(name) is None:
        raise RuntimeError(f"Missing required tool '{name}'. {install_hint}")


def fetch_audio(url: str, out_path: Path) -> Path:
    require_tool("yt-dlp", "Install with: python -m pip install yt-dlp")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "yt-dlp",
        "--extract-audio",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",
        "--no-playlist",
        "--output",
        str(out_path.with_suffix(".%(ext)s")),
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        stderr = result.stderr.strip() or "yt-dlp failed without stderr"
        raise RuntimeError(f"Failed to fetch audio: {stderr}")

    if not out_path.exists():
        candidates = sorted(out_path.parent.glob(f"{out_path.stem}.*"))
        if len(candidates) == 1:
            candidates[0].rename(out_path)
        elif len(candidates) > 1:
            raise RuntimeError(f"Expected exactly one downloaded file for {out_path.stem}, found {len(candidates)}")

    if not out_path.exists():
        raise RuntimeError(f"Audio download succeeded but output file not found: {out_path}")
    return out_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Fetch YouTube audio as mp3")
    parser.add_argument("--url", required=True, help="YouTube URL")
    parser.add_argument("--out", required=True, help="Output mp3 path")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    out = fetch_audio(url=args.url, out_path=Path(args.out))
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
