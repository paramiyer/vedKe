from __future__ import annotations

import difflib
import json
import subprocess
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

from .visual import _require_tool

PT_TO_PX = 96.0 / 72.0
DEVANAGARI_TO_ASCII_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")


@dataclass(frozen=True)
class PdfWord:
    page: int
    text: str
    x: float
    y: float
    w: float
    h: float
    norm: str
    base_norm: str


@dataclass(frozen=True)
class KaraokeToken:
    token_id: str
    line_id: str
    deva: str
    kind: str
    norm: str
    base_norm: str


SPECIAL_PUNCT = {"।", "॥"}


def _normalize_for_match(text: str) -> str:
    normalized = unicodedata.normalize("NFC", text)
    normalized = normalized.translate(DEVANAGARI_TO_ASCII_DIGITS)
    filtered = []
    for ch in normalized:
        category = unicodedata.category(ch)
        if category == "Cf":
            continue
        if ch.isspace():
            continue
        filtered.append(ch)
    return "".join(filtered)


def _normalize_base(text: str) -> str:
    normalized = _normalize_for_match(text)
    filtered = []
    for ch in normalized:
        category = unicodedata.category(ch)
        if category in {"Mn", "Mc", "Me"}:
            continue
        filtered.append(ch)
    return "".join(filtered)


def _run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True, check=False)


def _split_pdf_word(word: PdfWord) -> list[PdfWord]:
    text = word.text
    if not text:
        return []

    parts: list[str] = []
    i = 0
    while i < len(text):
        char = text[i]
        if char in SPECIAL_PUNCT:
            parts.append(char)
            i += 1
            continue
        if char.isdigit():
            j = i + 1
            while j < len(text) and text[j].isdigit():
                j += 1
            parts.append(text[i:j])
            i = j
            continue
        j = i + 1
        while j < len(text) and text[j] not in SPECIAL_PUNCT and not text[j].isdigit():
            j += 1
        parts.append(text[i:j])
        i = j

    if len(parts) <= 1:
        return [word]

    char_total = max(1, len(text))
    offset_chars = 0
    split_words: list[PdfWord] = []
    for part in parts:
        part_chars = len(part)
        part_x = word.x + (word.w * (offset_chars / char_total))
        part_w = word.w * (part_chars / char_total)
        split_words.append(
            PdfWord(
                page=word.page,
                text=part,
                x=part_x,
                y=word.y,
                w=part_w,
                h=word.h,
                norm=_normalize_for_match(part),
                base_norm=_normalize_base(part),
            )
        )
        offset_chars += part_chars

    return split_words


def _split_word_from_base(word: PdfWord, parts: list[str]) -> list[PdfWord]:
    if len(parts) <= 1:
        return [word]
    total = sum(max(1, len(part)) for part in parts)
    out: list[PdfWord] = []
    offset = 0.0
    for part in parts:
        weight = max(1, len(part))
        width = word.w * (weight / total)
        out.append(
            PdfWord(
                page=word.page,
                text=part,
                x=word.x + offset,
                y=word.y,
                w=width,
                h=word.h,
                norm=part,
                base_norm=part,
            )
        )
        offset += width
    return out


def _decompose_base_word(base_text: str, token_vocab: set[str], max_parts: int = 5) -> list[str] | None:
    if not base_text or base_text in token_vocab:
        return None

    memo: dict[tuple[int, int], list[str] | None] = {}
    n = len(base_text)

    def dfs(pos: int, parts_used: int) -> list[str] | None:
        if pos == n:
            return []
        if parts_used >= max_parts:
            return None
        key = (pos, parts_used)
        if key in memo:
            return memo[key]

        best: list[str] | None = None
        for end in range(n, pos, -1):
            piece = base_text[pos:end]
            if piece not in token_vocab:
                continue
            tail = dfs(end, parts_used + 1)
            if tail is None:
                continue
            candidate = [piece, *tail]
            if best is None or len(candidate) < len(best):
                best = candidate

        memo[key] = best
        return best

    parts = dfs(0, 0)
    if parts is None or len(parts) <= 1:
        return None
    return parts


def split_words_with_token_vocab(words: list[PdfWord], tokens: list[KaraokeToken]) -> list[PdfWord]:
    token_vocab = {token.base_norm for token in tokens if token.base_norm}
    if not token_vocab:
        return words

    split_words: list[PdfWord] = []
    for word in words:
        parts = _decompose_base_word(word.base_norm, token_vocab)
        if not parts:
            split_words.append(word)
            continue
        split_words.extend(_split_word_from_base(word, parts))
    return split_words


def load_pdftotext_bbox_xml(pdf_path: Path) -> str:
    _require_tool("pdftotext", "Install poppler (macOS: `brew install poppler`).")
    result = _run(["pdftotext", "-bbox-layout", str(pdf_path), "-"])
    if result.returncode != 0:
        raise RuntimeError(f"pdftotext failed for {pdf_path}:\n{result.stderr.strip()}")
    return result.stdout


def parse_pdftotext_bbox_xml(xml_text: str) -> tuple[dict[int, tuple[float, float]], list[PdfWord]]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise RuntimeError(f"Could not parse pdftotext output XML: {exc}") from exc

    pages: dict[int, tuple[float, float]] = {}
    words: list[PdfWord] = []

    def local_name(tag: str) -> str:
        return tag.rsplit("}", 1)[-1]

    page_index = 0
    for page in root.iter():
        if local_name(page.tag) != "page":
            continue
        page_index += 1
        width = float(page.attrib["width"])
        height = float(page.attrib["height"])
        pages[page_index] = (width, height)

        for word_node in page.iter():
            if local_name(word_node.tag) != "word":
                continue
            text = (word_node.text or "").strip()
            if not text:
                continue
            x_min = float(word_node.attrib["xMin"])
            y_min = float(word_node.attrib["yMin"])
            x_max = float(word_node.attrib["xMax"])
            y_max = float(word_node.attrib["yMax"])
            word = PdfWord(
                page=page_index,
                text=text,
                x=x_min,
                y=y_min,
                w=max(0.0, x_max - x_min),
                h=max(0.0, y_max - y_min),
                norm=_normalize_for_match(text),
                base_norm=_normalize_base(text),
            )
            words.extend(_split_pdf_word(word))

    if not words:
        raise RuntimeError("pdftotext output contained no words")

    return pages, words


def load_karaoke_tokens(karaoke_path: Path) -> tuple[str, list[KaraokeToken]]:
    payload = json.loads(karaoke_path.read_text(encoding="utf-8"))
    slug = str(payload.get("slug", ""))
    if not slug:
        raise ValueError("karaoke.json slug is missing")
    lines = payload.get("lines")
    if not isinstance(lines, list):
        raise ValueError("karaoke.json lines must be an array")

    tokens: list[KaraokeToken] = []
    for line in lines:
        if not isinstance(line, dict):
            raise ValueError("karaoke.json line must be an object")
        line_id = str(line.get("lineId", ""))
        raw_tokens = line.get("tokens")
        if not line_id or not isinstance(raw_tokens, list):
            raise ValueError("karaoke.json line missing lineId/tokens")
        for token in raw_tokens:
            if not isinstance(token, dict):
                raise ValueError("karaoke.json token must be an object")
            token_id = str(token.get("id", ""))
            deva = str(token.get("deva", ""))
            if not token_id:
                raise ValueError(f"karaoke token id missing in {line_id}")
            if not deva:
                raise ValueError(f"karaoke token deva missing in {line_id}/{token_id}")
            tokens.append(
                KaraokeToken(
                    token_id=token_id,
                    line_id=line_id,
                    deva=deva,
                    kind=str(token.get("kind", "word")),
                    norm=_normalize_for_match(deva),
                    base_norm=_normalize_base(deva),
                )
            )
    return slug, tokens


def _similarity(token: KaraokeToken, word: PdfWord) -> float:
    if token.norm == word.norm and token.norm:
        return 1.0
    if token.base_norm == word.base_norm and token.base_norm:
        return 0.95
    if not token.base_norm or not word.base_norm:
        return 0.0
    return difflib.SequenceMatcher(a=token.base_norm, b=word.base_norm).ratio()


def align_tokens_to_words(tokens: list[KaraokeToken], words: list[PdfWord]) -> tuple[list[tuple[KaraokeToken, PdfWord]], list[KaraokeToken]]:
    n = len(tokens)
    m = len(words)
    if n == 0 or m == 0:
        raise RuntimeError("Cannot align empty token/word stream")

    gap_penalty = -0.55
    match_cutoff = 0.52

    scores = [[0.0] * (m + 1) for _ in range(n + 1)]
    trace = [[0] * (m + 1) for _ in range(n + 1)]  # 1=diag, 2=up, 3=left

    for i in range(1, n + 1):
        scores[i][0] = scores[i - 1][0] + gap_penalty
        trace[i][0] = 2
    for j in range(1, m + 1):
        scores[0][j] = scores[0][j - 1] + gap_penalty
        trace[0][j] = 3

    for i in range(1, n + 1):
        token = tokens[i - 1]
        for j in range(1, m + 1):
            word = words[j - 1]
            sim = _similarity(token, word)
            diag = scores[i - 1][j - 1] + (sim * 2.0 - 1.0)
            up = scores[i - 1][j] + gap_penalty
            left = scores[i][j - 1] + gap_penalty
            if diag >= up and diag >= left:
                scores[i][j] = diag
                trace[i][j] = 1
            elif up >= left:
                scores[i][j] = up
                trace[i][j] = 2
            else:
                scores[i][j] = left
                trace[i][j] = 3

    aligned: list[tuple[KaraokeToken, PdfWord]] = []
    missing: list[KaraokeToken] = []
    i = n
    j = m
    while i > 0 or j > 0:
        step = trace[i][j] if i >= 0 and j >= 0 else 0
        if i > 0 and j > 0 and step == 1:
            token = tokens[i - 1]
            word = words[j - 1]
            sim = _similarity(token, word)
            if sim >= match_cutoff:
                aligned.append((token, word))
            else:
                missing.append(token)
            i -= 1
            j -= 1
        elif i > 0 and (j == 0 or step == 2):
            missing.append(tokens[i - 1])
            i -= 1
        elif j > 0:
            j -= 1
        else:
            break

    aligned.reverse()

    missing.reverse()
    return aligned, missing


def _load_visual_scales(
    visual_manifest_path: Path,
    pdf_pages: dict[int, tuple[float, float]],
) -> dict[int, tuple[float, float]]:
    if not visual_manifest_path.exists():
        return {}

    payload = json.loads(visual_manifest_path.read_text(encoding="utf-8"))
    raw_pages = payload.get("pages", [])
    if not isinstance(raw_pages, list):
        return {}

    scales: dict[int, tuple[float, float]] = {}
    for page in raw_pages:
        if not isinstance(page, dict):
            continue
        page_num = page.get("page")
        width = page.get("width")
        height = page.get("height")
        if not isinstance(page_num, int) or not isinstance(width, (float, int)) or not isinstance(height, (float, int)):
            continue
        pdf_size = pdf_pages.get(page_num)
        if not pdf_size:
            continue
        pdf_w, pdf_h = pdf_size
        if pdf_w <= 0 or pdf_h <= 0:
            continue
        scales[page_num] = (float(width) / pdf_w, float(height) / pdf_h)

    return scales


def build_highlights_payload(
    aligned: list[tuple[KaraokeToken, PdfWord]],
    page_scales: dict[int, tuple[float, float]],
) -> dict:
    pages: dict[str, list[dict[str, object]]] = {}
    for token, word in aligned:
        scale_x, scale_y = page_scales.get(word.page, (PT_TO_PX, PT_TO_PX))
        page_key = str(word.page)
        pages.setdefault(page_key, []).append(
            {
                "id": token.token_id,
                "kind": token.kind,
                "x": round(word.x * scale_x, 3),
                "y": round(word.y * scale_y, 3),
                "w": round(word.w * scale_x, 3),
                "h": round(word.h * scale_y, 3),
                "label": token.deva,
            }
        )
    return {"pages": pages}


def write_highlights_json(slug: str, karaoke_path: Path, pdf_path: Path, out_dir: Path) -> Path:
    if not karaoke_path.exists():
        raise FileNotFoundError(f"Karaoke JSON not found: {karaoke_path}")
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    karaoke_slug, tokens = load_karaoke_tokens(karaoke_path)
    if karaoke_slug != slug:
        raise ValueError(f"Slug mismatch: --slug={slug} but karaoke.json has slug={karaoke_slug}")

    xml_text = load_pdftotext_bbox_xml(pdf_path)
    pdf_pages, words = parse_pdftotext_bbox_xml(xml_text)
    words = split_words_with_token_vocab(words=words, tokens=tokens)
    aligned, missing = align_tokens_to_words(tokens=tokens, words=words)
    coverage = len(aligned) / max(1, len(tokens))
    if missing:
        lines = "\n".join(f"- {item.token_id} ({item.line_id}): {item.deva}" for item in missing[:10])
        report_path = out_dir / "visual" / "highlights.unmatched.json"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report = {
            "slug": slug,
            "matched": len(aligned),
            "totalTokens": len(tokens),
            "coverage": round(coverage, 4),
            "unmatched": [{"id": token.token_id, "lineId": token.line_id, "deva": token.deva, "kind": token.kind} for token in missing],
        }
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raise RuntimeError(
            f"Could not fully align tokens: matched {len(aligned)}/{len(tokens)} tokens ({coverage:.1%}).\n"
            f"First unmatched tokens:\n{lines}"
        )

    visual_manifest_path = out_dir / "visual" / "visual.json"
    scales = _load_visual_scales(visual_manifest_path=visual_manifest_path, pdf_pages=pdf_pages)
    payload = build_highlights_payload(aligned=aligned, page_scales=scales)

    highlights_path = out_dir / "visual" / "highlights.json"
    highlights_path.parent.mkdir(parents=True, exist_ok=True)
    highlights_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return highlights_path
