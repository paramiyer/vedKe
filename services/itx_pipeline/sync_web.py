from __future__ import annotations

import shutil
from pathlib import Path

ALLOWED_MEDIA_EXTS = {".png", ".jpg", ".webp", ".mp3", ".wav", ".svg"}
ALLOWED_JSON_NAMES = {"visual.json", "highlights.json"}


def _copy_file(src: Path, dst: Path, copied: list[Path]) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    copied.append(dst)


def sync_web_assets(slug: str, build_dir: Path, web_dir: Path) -> list[Path]:
    del slug  # kept for CLI/reporting symmetry and future validation hooks.

    build_dir = build_dir.resolve()
    web_dir = web_dir.resolve()
    web_dir.mkdir(parents=True, exist_ok=True)

    copied: list[Path] = []

    karaoke_path = build_dir / "karaoke.json"
    visual_manifest = build_dir / "visual" / "visual.json"
    if not karaoke_path.exists() and not visual_manifest.exists():
        raise FileNotFoundError(f"Missing required file: expected {karaoke_path} or {visual_manifest}")

    if karaoke_path.exists():
        _copy_file(karaoke_path, web_dir / "karaoke.json", copied)

    tokens_path = build_dir / "tokens.json"
    if tokens_path.exists():
        _copy_file(tokens_path, web_dir / "tokens.json", copied)

    for path in sorted(build_dir.rglob("*")):
        if not path.is_file():
            continue
        include_json = path.suffix.lower() == ".json" and path.name in ALLOWED_JSON_NAMES
        if path.suffix.lower() not in ALLOWED_MEDIA_EXTS and not include_json:
            continue
        rel = path.relative_to(build_dir)
        _copy_file(path, web_dir / rel, copied)

    return copied
