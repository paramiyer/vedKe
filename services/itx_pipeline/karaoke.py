from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


def _should_join_to_next(current: dict, next_token: dict | None) -> bool:
    if next_token is None:
        return False

    current_kind = str(current.get("kind", ""))
    next_kind = str(next_token.get("kind", ""))

    # No space before punctuation.
    if next_kind == "punct":
        return True

    # Keep numeric verse markers compact: "॥10॥".
    if current_kind == "punct" and str(next_token.get("deva", "")).isdigit():
        return True

    return False


def _group_original_tokens(tokens: list[dict]) -> list[tuple[str, list[str]]]:
    grouped: list[tuple[str, list[str]]] = []
    for token in tokens:
        line_id = str(token["lineId"])
        token_id = str(token["id"])

        if not grouped or grouped[-1][0] != line_id:
            grouped.append((line_id, [token_id]))
        else:
            grouped[-1][1].append(token_id)

    return grouped


def validate_karaoke_payload(tokens_payload: dict, karaoke_payload: dict) -> None:
    original_tokens = list(tokens_payload.get("tokens", []))
    karaoke_lines = list(karaoke_payload.get("lines", []))

    original_ids = [str(token["id"]) for token in original_tokens]
    karaoke_ids = [str(token["id"]) for line in karaoke_lines for token in line.get("tokens", [])]

    if Counter(karaoke_ids) != Counter(original_ids):
        raise ValueError("karaoke.json token ids must appear exactly once and match tokens.json")

    grouped_original = _group_original_tokens(original_tokens)
    grouped_karaoke = [
        (str(line.get("lineId", "")), [str(token.get("id", "")) for token in line.get("tokens", [])])
        for line in karaoke_lines
    ]

    if grouped_karaoke != grouped_original:
        raise ValueError("karaoke.json lines must preserve original lineId grouping and token order")


def build_karaoke_payload(tokens_payload: dict) -> dict:
    tokens = list(tokens_payload.get("tokens", []))
    slug = str(tokens_payload.get("slug", ""))

    lines: list[dict] = []
    current_line_id: str | None = None
    current_line_tokens: list[dict] = []

    for idx, token in enumerate(tokens):
        line_id = str(token["lineId"])

        if current_line_id is None:
            current_line_id = line_id

        if line_id != current_line_id:
            lines.append({"lineId": current_line_id, "tokens": current_line_tokens})
            current_line_id = line_id
            current_line_tokens = []

        next_token = tokens[idx + 1] if idx + 1 < len(tokens) else None
        current_line_tokens.append(
            {
                "id": str(token["id"]),
                "deva": str(token["deva"]),
                "kind": str(token["kind"]),
                "joinToNext": _should_join_to_next(token, next_token),
            }
        )

    if current_line_id is not None:
        lines.append({"lineId": current_line_id, "tokens": current_line_tokens})

    karaoke_payload = {"slug": slug, "lines": lines}
    validate_karaoke_payload(tokens_payload=tokens_payload, karaoke_payload=karaoke_payload)
    return karaoke_payload


def write_karaoke_json(tokens_path: Path, out_dir: Path) -> Path:
    tokens_payload = json.loads(tokens_path.read_text(encoding="utf-8"))
    karaoke_payload = build_karaoke_payload(tokens_payload=tokens_payload)

    out_dir.mkdir(parents=True, exist_ok=True)
    output_path = out_dir / "karaoke.json"
    output_path.write_text(json.dumps(karaoke_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return output_path
