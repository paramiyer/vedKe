from __future__ import annotations

import json
import unicodedata
from collections import Counter
from pathlib import Path

DANDA = {"।", "॥"}
FORBIDDEN_CHARS = {"\\", "{", "}", "^", "~", "`", "'"}
REQUIRED_VEDIC_MARKS = {"\u0951", "\u0952", "\u1CF2"}
ALLOWED_VEDIC_RANGE = (0x1CD0, 0x1CFF)


class ValidationError(Exception):
    pass


def _codepoints(text: str) -> str:
    return " ".join(f"U+{ord(ch):04X}" for ch in text)


def _is_devanagari(ch: str) -> bool:
    cp = ord(ch)
    return 0x0900 <= cp <= 0x097F


def _is_allowed_vedic_mark(ch: str) -> bool:
    cp = ord(ch)
    return ALLOWED_VEDIC_RANGE[0] <= cp <= ALLOWED_VEDIC_RANGE[1] or ch in REQUIRED_VEDIC_MARKS


def _is_allowed_char(ch: str) -> bool:
    if _is_devanagari(ch):
        return True
    if _is_allowed_vedic_mark(ch):
        return True
    if ch in DANDA:
        return True
    if "0" <= ch <= "9":
        return True
    return False


def load_tokens_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_tokens_payload(payload: dict) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    tokens = payload.get("tokens", [])

    prev_by_line: dict[str, dict] = {}

    for token in tokens:
        token_id = str(token.get("id", ""))
        line_id = str(token.get("lineId", ""))
        deva = str(token.get("deva", ""))
        kind = str(token.get("kind", ""))

        def add(message: str, value: str | None = None) -> None:
            shown = deva if value is None else value
            errors.append(
                {
                    "id": token_id,
                    "lineId": line_id,
                    "deva": shown,
                    "codepoints": _codepoints(shown),
                    "message": message,
                }
            )

        if any(ch in FORBIDDEN_CHARS for ch in deva):
            add("contains forbidden TeX/ASCII characters")

        for ch in deva:
            if not _is_allowed_char(ch):
                add("contains disallowed character", ch)

        if deva and (_is_allowed_vedic_mark(deva[0]) or unicodedata.combining(deva[0]) != 0):
            add("starts with combining/Vedic mark")

        if deva in DANDA and kind != "punct":
            add("danda token must have kind='punct'")

        if deva.isdigit() and kind != "punct":
            add("digit token must have kind='punct'")

        prev = prev_by_line.get(line_id)
        if prev and prev.get("deva", "").isdigit() and deva.isdigit():
            add("adjacent digit tokens in same line (number split)")
        prev_by_line[line_id] = token

    return errors


def format_validation_errors(errors: list[dict[str, str]]) -> str:
    lines = [f"Validation failed with {len(errors)} error(s):"]
    for err in errors:
        lines.append(
            f"- {err['id']} ({err['lineId']}): {err['message']} | '{err['deva']}' | [{err['codepoints']}]"
        )
    return "\n".join(lines)


def validate_tokens_file(tokens_path: Path) -> int:
    payload = load_tokens_json(tokens_path)
    errors = validate_tokens_payload(payload)
    if errors:
        print(format_validation_errors(errors))
        return 1
    print("Validation passed: 0 errors")
    return 0


def audit_charset(payload: dict) -> tuple[Counter, list[dict], set[str]]:
    tokens = payload.get("tokens", [])
    char_counts: Counter = Counter()
    tokens_with_unexpected: list[dict] = []
    unexpected_chars_seen: set[str] = set()

    for token in tokens:
        deva = str(token.get("deva", ""))
        has_unexpected = False

        for ch in deva:
            # Track characters that are not Devanagari letters.
            cat = unicodedata.category(ch)
            is_deva_letter = _is_devanagari(ch) and cat.startswith("L")
            if not is_deva_letter:
                char_counts[ch] += 1

            if not _is_allowed_char(ch):
                has_unexpected = True
                unexpected_chars_seen.add(ch)

        if has_unexpected:
            tokens_with_unexpected.append(token)

    return char_counts, tokens_with_unexpected, unexpected_chars_seen


def print_charset_audit(tokens_path: Path) -> int:
    payload = load_tokens_json(tokens_path)
    counts, suspect_tokens, unexpected_chars = audit_charset(payload)

    print("Non-Devanagari-letter character counts:")
    if not counts:
        print("- none")
    else:
        for ch, count in counts.most_common():
            name = unicodedata.name(ch, "UNKNOWN")
            print(f"- '{ch}' (U+{ord(ch):04X}, {name}): {count}")

    print("\nUnexpected characters:")
    if not unexpected_chars:
        print("- none")
    else:
        for ch in sorted(unexpected_chars):
            name = unicodedata.name(ch, "UNKNOWN")
            print(f"- '{ch}' (U+{ord(ch):04X}, {name})")

    print("\nTop 20 tokens containing unexpected chars:")
    if not suspect_tokens:
        print("- none")
    else:
        for token in suspect_tokens[:20]:
            deva = str(token.get("deva", ""))
            print(
                f"- {token.get('id')} ({token.get('lineId')}): '{deva}' [{_codepoints(deva)}]"
            )

    return 0
