from __future__ import annotations

import argparse
from pathlib import Path

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

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.handler(args)
