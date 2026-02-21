from __future__ import annotations

import argparse
from pathlib import Path

from .alignment import build_timings, load_highlighter, load_tokens, save_timings, validate_timings_payload
from .highlights import write_highlights_json
from .karaoke import write_karaoke_json
from .parser import write_tokens_json
from .sync_web import sync_web_assets
from .validation import print_charset_audit, validate_tokens_file
from .visual import build_visual_assets


def _build_tokens(args: argparse.Namespace) -> int:
    output = write_tokens_json(slug=args.slug, itx_path=Path(args.itx), out_dir=Path(args.out))
    print(output)
    return 0


def _validate_tokens(args: argparse.Namespace) -> int:
    return validate_tokens_file(tokens_path=Path(args.tokens))


def _audit_charset(args: argparse.Namespace) -> int:
    return print_charset_audit(tokens_path=Path(args.tokens))


def _build_karaoke(args: argparse.Namespace) -> int:
    output = write_karaoke_json(tokens_path=Path(args.tokens), out_dir=Path(args.out))
    print(output)
    return 0


def _sync_web(args: argparse.Namespace) -> int:
    copied = sync_web_assets(
        slug=args.slug,
        build_dir=Path(args.build),
        web_dir=Path(args.web),
    )
    print(f"Copied {len(copied)} file(s):")
    for item in copied:
        print(item)
    return 0


def _build_visual(args: argparse.Namespace) -> int:
    output = build_visual_assets(slug=args.slug, itx_path=Path(args.itx), out_dir=Path(args.out))
    print(output)
    return 0


def _build_highlights(args: argparse.Namespace) -> int:
    output = write_highlights_json(
        slug=args.slug,
        karaoke_path=Path(args.karaoke),
        pdf_path=Path(args.pdf),
        out_dir=Path(args.out),
    )
    print(output)
    return 0


def _build_pipeline(args: argparse.Namespace) -> int:
    build_dir = Path(args.out)
    web_dir = Path(args.web)
    itx_path = Path(args.itx)
    pdf_path = Path(args.pdf)

    tokens_out = write_tokens_json(slug=args.slug, itx_path=itx_path, out_dir=build_dir)
    print(tokens_out)

    karaoke_out = write_karaoke_json(tokens_path=build_dir / "tokens.json", out_dir=build_dir)
    print(karaoke_out)

    visual_out = build_visual_assets(slug=args.slug, itx_path=itx_path, out_dir=build_dir)
    print(visual_out)

    highlights_out = write_highlights_json(
        slug=args.slug,
        karaoke_path=build_dir / "karaoke.json",
        pdf_path=pdf_path,
        out_dir=build_dir,
    )
    print(highlights_out)

    copied = sync_web_assets(slug=args.slug, build_dir=build_dir, web_dir=web_dir)
    print(f"Copied {len(copied)} file(s):")
    for item in copied:
        print(item)
    return 0


def _align_audio(args: argparse.Namespace) -> int:
    _, tokens = load_tokens(Path(args.tokens))
    highlighter = load_highlighter(Path(args.highlighter))
    payload = build_timings(
        tokens=tokens,
        highlighter=highlighter,
        audio_path=Path(args.audio),
        audio_url=args.url,
        engine=args.engine,
        duration_ms_override=args.duration_ms,
    )
    out = save_timings(payload, Path(args.out))
    print(out)
    return 0


def _validate_alignment(args: argparse.Namespace) -> int:
    import json

    _, tokens = load_tokens(Path(args.tokens))
    highlighter = load_highlighter(Path(args.highlighter))
    payload = json.loads(Path(args.timings).read_text(encoding="utf-8"))
    errors = validate_timings_payload(tokens=tokens, highlighter=highlighter, timings_payload=payload)
    if errors:
        print(f"Validation failed with {len(errors)} error(s):")
        for err in errors:
            print(f"- {err}")
        return 1
    print("Alignment validation passed.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m services.itx_pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)

    build_tokens = subparsers.add_parser("build-tokens", help="Build deterministic tokens.json from an .itx file")
    build_tokens.add_argument("--slug", required=True, help="Sukta slug for payload metadata")
    build_tokens.add_argument("--itx", required=True, help="Path to input .itx file")
    build_tokens.add_argument("--out", required=True, help="Output directory for tokens.json")
    build_tokens.set_defaults(handler=_build_tokens)

    validate_tokens = subparsers.add_parser("validate-tokens", help="Validate generated tokens.json")
    validate_tokens.add_argument("--tokens", required=True, help="Path to tokens.json")
    validate_tokens.set_defaults(handler=_validate_tokens)

    audit_charset = subparsers.add_parser("audit-charset", help="Report non-letter charset usage in tokens.json")
    audit_charset.add_argument("--tokens", required=True, help="Path to tokens.json")
    audit_charset.set_defaults(handler=_audit_charset)

    build_karaoke = subparsers.add_parser("build-karaoke", help="Build front-end karaoke.json from tokens.json")
    build_karaoke.add_argument("--tokens", required=True, help="Path to tokens.json")
    build_karaoke.add_argument("--out", required=True, help="Output directory for karaoke.json")
    build_karaoke.set_defaults(handler=_build_karaoke)

    sync_web = subparsers.add_parser("sync-web", help="Copy CP outputs into Vite public suktas directory")
    sync_web.add_argument("--slug", required=True, help="Sukta slug being synced")
    sync_web.add_argument("--build", required=True, help="Build slug directory (contains karaoke.json)")
    sync_web.add_argument("--web", required=True, help="Web destination dir (e.g. apps/web/public/suktas/<slug>)")
    sync_web.set_defaults(handler=_sync_web)

    build_visual = subparsers.add_parser("build-visual", help="Build PDF-derived visual assets (SVG pages + manifest)")
    build_visual.add_argument("--slug", required=True, help="Sukta slug for visual metadata")
    build_visual.add_argument("--itx", required=True, help="Path to source .itx document")
    build_visual.add_argument("--out", required=True, help="Output directory for visual assets")
    build_visual.set_defaults(handler=_build_visual)

    build_highlights = subparsers.add_parser(
        "build-highlights",
        help="Build word-level visual/highlights.json by aligning karaoke tokens with PDF word bboxes",
    )
    build_highlights.add_argument("--slug", required=True, help="Sukta slug for validation")
    build_highlights.add_argument("--karaoke", required=True, help="Path to karaoke.json")
    build_highlights.add_argument("--pdf", required=True, help="Path to source PDF with extractable text layer")
    build_highlights.add_argument("--out", required=True, help="Build slug directory containing visual/visual.json")
    build_highlights.set_defaults(handler=_build_highlights)

    build_pipeline = subparsers.add_parser(
        "build-pipeline",
        help="Run end-to-end reusable sukta pipeline: tokens -> karaoke -> visual -> highlights -> sync-web",
    )
    build_pipeline.add_argument("--slug", required=True, help="Sukta slug")
    build_pipeline.add_argument("--itx", required=True, help="Path to source .itx file")
    build_pipeline.add_argument("--pdf", required=True, help="Path to source PDF with extractable text layer")
    build_pipeline.add_argument("--out", required=True, help="Build slug directory (e.g. build/<slug>)")
    build_pipeline.add_argument("--web", required=True, help="Web destination dir (e.g. apps/web/public/suktas/<slug>)")
    build_pipeline.set_defaults(handler=_build_pipeline)

    align_audio = subparsers.add_parser(
        "align-audio",
        help="Build data/alignment/timings.json with strict token-index invariants",
    )
    align_audio.add_argument("--tokens", required=True, help="Path to tokens.json")
    align_audio.add_argument("--highlighter", required=True, help="Path to highlighter/highlights json")
    align_audio.add_argument("--audio", required=True, help="Path to source mp3")
    align_audio.add_argument("--out", required=True, help="Output path for timings.json")
    align_audio.add_argument("--engine", default="whisperx", choices=["whisperx", "fallback"], help="Alignment engine")
    align_audio.add_argument("--url", default="", help="Source URL for metadata")
    align_audio.add_argument("--duration-ms", type=int, default=None, help="Optional audio duration override for offline fallback")
    align_audio.set_defaults(handler=_align_audio)

    validate_alignment = subparsers.add_parser(
        "validate-alignment",
        help="Validate tokens/highlighter/timings index and timing invariants",
    )
    validate_alignment.add_argument("--tokens", required=True, help="Path to tokens.json")
    validate_alignment.add_argument("--highlighter", required=True, help="Path to highlighter/highlights json")
    validate_alignment.add_argument("--timings", required=True, help="Path to timings.json")
    validate_alignment.set_defaults(handler=_validate_alignment)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.handler(args)
