from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Iterable

SVARA_MAP = {
    "`": "॒",
    "'": "॑",
    '"': "᳚",
}

INDEPENDENT_VOWELS = {
    "ai": "ऐ",
    "au": "औ",
    "RRi": "ॠ",
    "RRI": "ॠ",
    "R^I": "ॠ",
    "R^i": "ऋ",
    "LLi": "ॡ",
    "L^I": "ॡ",
    "L^i": "ऌ",
    "A": "आ",
    "I": "ई",
    "U": "ऊ",
    "e": "ए",
    "o": "ओ",
    "a": "अ",
    "i": "इ",
    "u": "उ",
}

VOWEL_SIGNS = {
    "ai": "ै",
    "au": "ौ",
    "RRi": "ॄ",
    "RRI": "ॄ",
    "R^I": "ॄ",
    "R^i": "ृ",
    "LLi": "ॣ",
    "L^I": "ॣ",
    "L^i": "ॢ",
    "A": "ा",
    "I": "ी",
    "U": "ू",
    "e": "े",
    "o": "ो",
    "a": "",
    "i": "ि",
    "u": "ु",
}

CONSONANTS = {
    "kSh": "क्ष",
    "j~n": "ज्ञ",
    "chh": "छ",
    "kh": "ख",
    "gh": "घ",
    "ch": "च",
    "Ch": "छ",
    "jh": "झ",
    "Th": "ठ",
    "Dh": "ढ",
    "th": "थ",
    "dh": "ध",
    "ph": "फ",
    "bh": "भ",
    "sh": "श",
    "Sh": "ष",
    "~N": "ङ",
    "~n": "ञ",
    "N": "ण",
    "T": "ट",
    "D": "ड",
    "p": "प",
    "b": "ब",
    "m": "म",
    "y": "य",
    "r": "र",
    "l": "ल",
    "v": "व",
    "w": "व",
    "s": "स",
    "h": "ह",
    "g": "ग",
    "j": "ज",
    "k": "क",
    "t": "त",
    "d": "द",
    "n": "न",
    "f": "फ",
    "x": "क्ष",
}

MODIFIERS = {
    ".n": "ं",
    "M": "ं",
    "H": "ः",
    ".h": "ः",
    ".a": "ऽ",
}

TOKEN_RE = re.compile(r"[\u0900-\u097f\u1cd0-\u1cff]+|\d+|[^\s\u0900-\u097f\u1cd0-\u1cff\d]")


def _sorted_keys(mapping: dict[str, str]) -> list[str]:
    return sorted(mapping.keys(), key=len, reverse=True)


VOWEL_KEYS = _sorted_keys(INDEPENDENT_VOWELS)
CONS_KEYS = _sorted_keys(CONSONANTS)
MOD_KEYS = _sorted_keys(MODIFIERS)


def _match_from(text: str, i: int, options: list[str]) -> str | None:
    for key in options:
        if text.startswith(key, i):
            return key
    return None


def normalize_itx_line(line: str) -> str:
    # Preserve ITX nasalization marker explicitly as chandrabindu.
    # This avoids collapsing distinct source intent into plain anusvara.
    line = line.replace("{\\m+}", "ँ")
    line = line.replace("\\m+", "ँ")
    return line


def transliterate_itx_to_deva(text: str) -> str:
    text = normalize_itx_line(text)
    out: list[str] = []
    i = 0

    while i < len(text):
        # Vedic accent escapes from ITX/TeX.
        if text[i] == "\\" and i + 1 < len(text) and text[i + 1] in SVARA_MAP:
            out.append(SVARA_MAP[text[i + 1]])
            i += 2
            continue

        if text.startswith("OM", i):
            end = i + 2
            if end == len(text) or not text[end].isalpha():
                out.append("ॐ")
                i += 2
                continue

        mod = _match_from(text, i, MOD_KEYS)
        if mod:
            out.append(MODIFIERS[mod])
            i += len(mod)
            continue

        vowel = _match_from(text, i, VOWEL_KEYS)
        if vowel:
            out.append(INDEPENDENT_VOWELS[vowel])
            i += len(vowel)
            continue

        cons = _match_from(text, i, CONS_KEYS)
        if cons:
            out.append(CONSONANTS[cons])
            i += len(cons)

            vowel = _match_from(text, i, VOWEL_KEYS)
            if vowel:
                out.append(VOWEL_SIGNS[vowel])
                i += len(vowel)
            else:
                next_cons = _match_from(text, i, CONS_KEYS)
                if next_cons is not None or i >= len(text):
                    out.append("्")
            continue

        if text.startswith("..", i):
            out.append("॥")
            i += 2
            continue

        if text[i] == ".":
            out.append("।")
            i += 1
            continue

        out.append(text[i])
        i += 1

    return "".join(out)


def iter_content_lines(lines: Iterable[str]) -> Iterable[str]:
    in_document = False

    for raw in lines:
        line = raw.rstrip("\n")
        stripped = line.strip()

        if stripped == r"\begin{document}":
            in_document = True
            continue

        if stripped == r"\end{document}":
            break

        if not in_document:
            continue

        if stripped == "##":
            break

        if not stripped:
            continue

        if stripped.startswith("%"):
            continue

        if stripped.startswith("#"):
            continue

        if stripped.startswith("\\"):
            continue

        yield line


def is_word_token(token: str) -> bool:
    if not token:
        return False
    if token in {"।", "॥"}:
        return False
    if token.isdigit():
        return False
    for ch in token:
        if ch in {"।", "॥"}:
            return False
        if "0" <= ch <= "9":
            return False
    return True


def tokenize_deva_line(line: str) -> list[tuple[str, str]]:
    tokens: list[tuple[str, str]] = []
    for match in TOKEN_RE.finditer(line):
        tok = match.group(0)
        kind = "word" if is_word_token(tok) else "punct"
        tokens.append((tok, kind))
    return tokens


def build_tokens_payload(slug: str, itx_path: Path) -> dict:
    lines = itx_path.read_text(encoding="utf-8").splitlines()
    payload_tokens: list[dict] = []

    line_counter = 0
    for source_line in iter_content_lines(lines):
        deva_line = transliterate_itx_to_deva(source_line)
        pairs = tokenize_deva_line(deva_line)
        if not pairs:
            continue

        line_counter += 1
        line_id = f"L{line_counter:04d}"

        for token_idx, (token, kind) in enumerate(pairs, start=1):
            payload_tokens.append(
                {
                    "id": f"{line_id}_T{token_idx:04d}",
                    "lineId": line_id,
                    "deva": token,
                    "kind": kind,
                }
            )

    return {"slug": slug, "tokens": payload_tokens}


def write_tokens_json(slug: str, itx_path: Path, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    output_path = out_dir / "tokens.json"
    payload = build_tokens_payload(slug=slug, itx_path=itx_path)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return output_path
