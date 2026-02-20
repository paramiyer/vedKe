from __future__ import annotations

import json
from pathlib import Path

from services.itx_pipeline.visual import extract_svg_dimensions, write_visual_manifest


def test_extract_svg_dimensions_pt_units() -> None:
    svg = Path("tests/fixtures/sample_page.svg")
    width, height = extract_svg_dimensions(svg)
    assert round(width, 2) == 793.70
    assert round(height, 2) == 1122.52


def test_write_visual_manifest(tmp_path: Path) -> None:
    pages_dir = tmp_path / "visual" / "pages"
    pages_dir.mkdir(parents=True)
    (pages_dir / "page-001.svg").write_text(
        '<svg width="600px" height="400px" xmlns="http://www.w3.org/2000/svg"></svg>',
        encoding="utf-8",
    )
    (pages_dir / "page-002.svg").write_text(
        '<svg viewBox="0 0 1024 768" xmlns="http://www.w3.org/2000/svg"></svg>',
        encoding="utf-8",
    )

    manifest_path = tmp_path / "visual" / "visual.json"
    write_visual_manifest(slug="ganapati", pages_dir=pages_dir, manifest_path=manifest_path)
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert payload["slug"] == "ganapati"
    assert payload["pages"] == [
        {"page": 1, "svg": "pages/page-001.svg", "width": 600.0, "height": 400.0},
        {"page": 2, "svg": "pages/page-002.svg", "width": 1024.0, "height": 768.0},
    ]


def test_write_visual_manifest_normalizes_extensionless_pages(tmp_path: Path) -> None:
    pages_dir = tmp_path / "visual" / "pages"
    pages_dir.mkdir(parents=True)
    (pages_dir / "page-001").write_text(
        '<svg width="300px" height="200px" xmlns="http://www.w3.org/2000/svg"></svg>',
        encoding="utf-8",
    )

    manifest_path = tmp_path / "visual" / "visual.json"
    write_visual_manifest(slug="ganapati", pages_dir=pages_dir, manifest_path=manifest_path)
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert payload["pages"] == [
        {"page": 1, "svg": "pages/page-001.svg", "width": 300.0, "height": 200.0},
    ]
    assert not (pages_dir / "page-001").exists()
    assert (pages_dir / "page-001.svg").exists()
