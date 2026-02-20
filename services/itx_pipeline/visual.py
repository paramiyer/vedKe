from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path


def _run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=False)


def _require_tool(name: str, install_hint: str) -> None:
    if shutil.which(name):
        return
    raise RuntimeError(f"Missing required tool '{name}'. {install_hint}")


def _extract_pdf_page_count(pdf_path: Path) -> int:
    _require_tool("pdfinfo", "Install poppler (macOS: `brew install poppler`).")
    result = _run(["pdfinfo", str(pdf_path)])
    if result.returncode != 0:
        raise RuntimeError(f"pdfinfo failed for {pdf_path}:\n{result.stderr.strip()}")
    for line in result.stdout.splitlines():
        if line.startswith("Pages:"):
            _, value = line.split(":", 1)
            return int(value.strip())
    raise RuntimeError(f"Could not parse page count from pdfinfo output for {pdf_path}")


def _css_len_to_px(value: str | None) -> float | None:
    if not value:
        return None
    text = value.strip()
    if text.endswith("px"):
        return float(text[:-2])
    if text.endswith("pt"):
        return float(text[:-2]) * (96.0 / 72.0)
    try:
        return float(text)
    except ValueError:
        return None


def extract_svg_dimensions(svg_path: Path) -> tuple[float, float]:
    root = ET.parse(svg_path).getroot()
    width = _css_len_to_px(root.attrib.get("width"))
    height = _css_len_to_px(root.attrib.get("height"))
    if width is not None and height is not None:
        return (width, height)

    view_box = root.attrib.get("viewBox")
    if not view_box:
        raise RuntimeError(f"Could not determine dimensions for {svg_path}")
    values = view_box.replace(",", " ").split()
    if len(values) != 4:
        raise RuntimeError(f"Invalid viewBox in {svg_path}: {view_box}")
    return (float(values[2]), float(values[3]))


def _render_pdf_from_itx(itx_path: Path, work_dir: Path) -> Path:
    existing_pdf = itx_path.with_suffix(".pdf")
    if existing_pdf.exists():
        return existing_pdf

    _require_tool("itrans", "Install ITRANS tooling and ensure `itrans` is in PATH.")
    _require_tool("pdflatex", "Install LaTeX tooling (macOS: MacTeX/BasicTeX with pdflatex).")

    copied_itx = work_dir / itx_path.name
    copied_itx.write_text(itx_path.read_text(encoding="utf-8"), encoding="utf-8")
    expected_tex = copied_itx.with_suffix(".tex")

    itrans_attempts: list[list[str]] = [
        ["itrans", "-o", expected_tex.name, copied_itx.name],
        ["itrans", copied_itx.name],
    ]
    itrans_errors: list[str] = []
    generated_tex = False
    for cmd in itrans_attempts:
        result = _run(cmd, cwd=work_dir)
        if result.returncode == 0 and expected_tex.exists():
            generated_tex = True
            break
        itrans_errors.append(f"$ {' '.join(cmd)}\n{result.stderr.strip() or result.stdout.strip()}")

    if not generated_tex:
        details = "\n\n".join(err for err in itrans_errors if err.strip())
        raise RuntimeError(f"Failed to generate TeX from {itx_path} with itrans.\n{details}".strip())

    for _ in range(2):
        latex_result = _run(
            ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", expected_tex.name],
            cwd=work_dir,
        )
        if latex_result.returncode != 0:
            raise RuntimeError(
                f"pdflatex failed while building visual PDF from {itx_path}:\n{latex_result.stderr.strip() or latex_result.stdout.strip()}"
            )

    pdf_path = expected_tex.with_suffix(".pdf")
    if not pdf_path.exists():
        raise RuntimeError(f"Expected PDF was not produced: {pdf_path}")
    return pdf_path


def write_visual_manifest(slug: str, pages_dir: Path, manifest_path: Path) -> Path:
    for page_file in sorted(pages_dir.glob("page-*")):
        if not page_file.is_file() or page_file.suffix:
            continue
        normalized = page_file.with_suffix(".svg")
        if not normalized.exists():
            page_file.rename(normalized)

    page_files = sorted(pages_dir.glob("page-*.svg"))
    pages: list[dict[str, object]] = []
    for idx, svg_path in enumerate(page_files, start=1):
        width, height = extract_svg_dimensions(svg_path)
        pages.append(
            {
                "page": idx,
                "svg": str(svg_path.relative_to(manifest_path.parent)).replace("\\", "/"),
                "width": round(width, 3),
                "height": round(height, 3),
            }
        )
    payload = {"slug": slug, "pages": pages}
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest_path


def _write_empty_highlights(highlights_path: Path) -> None:
    if highlights_path.exists():
        return
    highlights_path.write_text(json.dumps({"pages": {}}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_visual_assets(slug: str, itx_path: Path, out_dir: Path) -> Path:
    if not itx_path.exists():
        raise FileNotFoundError(f"ITX source not found: {itx_path}")

    _require_tool("pdftocairo", "Install poppler (macOS: `brew install poppler`).")

    visual_dir = out_dir / "visual"
    pages_dir = visual_dir / "pages"
    visual_dir.mkdir(parents=True, exist_ok=True)
    pages_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=f"itx_visual_{slug}_") as tmp:
        work_dir = Path(tmp)
        pdf_path = _render_pdf_from_itx(itx_path=itx_path, work_dir=work_dir)
        page_count = _extract_pdf_page_count(pdf_path)

        for page_num in range(1, page_count + 1):
            out_prefix = pages_dir / f"page-{page_num:03d}"
            result = _run(
                [
                    "pdftocairo",
                    "-svg",
                    "-f",
                    str(page_num),
                    "-l",
                    str(page_num),
                    str(pdf_path),
                    str(out_prefix),
                ]
            )
            if result.returncode != 0:
                raise RuntimeError(
                    f"pdftocairo failed for page {page_num} of {pdf_path}:\n{result.stderr.strip() or result.stdout.strip()}"
                )
            # Some pdftocairo builds emit extensionless output for single-page exports.
            extensionless = out_prefix
            expected_svg = out_prefix.with_suffix(".svg")
            if extensionless.exists() and not expected_svg.exists():
                extensionless.rename(expected_svg)

    manifest_path = write_visual_manifest(slug=slug, pages_dir=pages_dir, manifest_path=visual_dir / "visual.json")
    _write_empty_highlights(visual_dir / "highlights.json")
    return manifest_path
