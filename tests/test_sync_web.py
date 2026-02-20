from __future__ import annotations

from pathlib import Path

from services.itx_pipeline.sync_web import sync_web_assets


def test_sync_web_copies_expected_files(tmp_path: Path) -> None:
    build_dir = tmp_path / "build" / "ganapati"
    web_dir = tmp_path / "apps" / "web" / "public" / "suktas" / "ganapati"
    build_dir.mkdir(parents=True)

    (build_dir / "karaoke.json").write_text('{"slug":"ganapati","lines":[]}', encoding="utf-8")
    (build_dir / "tokens.json").write_text('{"slug":"ganapati","tokens":[]}', encoding="utf-8")
    (build_dir / "audio.mp3").write_bytes(b"audio")
    (build_dir / "image.png").write_bytes(b"image")

    copied = sync_web_assets("ganapati", build_dir=build_dir, web_dir=web_dir)

    copied_names = sorted(path.name for path in copied)
    assert copied_names == ["audio.mp3", "image.png", "karaoke.json", "tokens.json"]
    assert (web_dir / "karaoke.json").exists()
    assert (web_dir / "tokens.json").exists()
    assert (web_dir / "audio.mp3").exists()
    assert (web_dir / "image.png").exists()


def test_sync_web_handles_missing_optional_assets(tmp_path: Path) -> None:
    build_dir = tmp_path / "build" / "ganapati"
    web_dir = tmp_path / "apps" / "web" / "public" / "suktas" / "ganapati"
    build_dir.mkdir(parents=True)

    (build_dir / "karaoke.json").write_text('{"slug":"ganapati","lines":[]}', encoding="utf-8")

    copied = sync_web_assets("ganapati", build_dir=build_dir, web_dir=web_dir)

    assert [path.name for path in copied] == ["karaoke.json"]
    assert (web_dir / "karaoke.json").exists()
    assert not (web_dir / "tokens.json").exists()


def test_sync_web_copies_visual_assets_with_subdirs(tmp_path: Path) -> None:
    build_dir = tmp_path / "build" / "ganapati"
    web_dir = tmp_path / "apps" / "web" / "public" / "suktas" / "ganapati"
    (build_dir / "visual" / "pages").mkdir(parents=True)

    (build_dir / "visual" / "visual.json").write_text('{"slug":"ganapati","pages":[]}', encoding="utf-8")
    (build_dir / "visual" / "highlights.json").write_text('{"pages":{}}', encoding="utf-8")
    (build_dir / "visual" / "pages" / "page-001.svg").write_text("<svg/>", encoding="utf-8")

    copied = sync_web_assets("ganapati", build_dir=build_dir, web_dir=web_dir)

    copied_rel = sorted(path.relative_to(web_dir).as_posix() for path in copied)
    assert copied_rel == [
        "visual/highlights.json",
        "visual/pages/page-001.svg",
        "visual/visual.json",
    ]
    assert (web_dir / "visual" / "visual.json").exists()
    assert (web_dir / "visual" / "highlights.json").exists()
    assert (web_dir / "visual" / "pages" / "page-001.svg").exists()
