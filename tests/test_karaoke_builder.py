from __future__ import annotations

import json
from pathlib import Path

from services.itx_pipeline.karaoke import build_karaoke_payload, write_karaoke_json


def test_build_karaoke_groups_tokens_by_line_in_original_order() -> None:
    payload = {
        "slug": "ganapati",
        "tokens": [
            {"id": "L0001_T0001", "lineId": "L0001", "deva": "ॐ", "kind": "word"},
            {"id": "L0001_T0002", "lineId": "L0001", "deva": "शान्तिः", "kind": "word"},
            {"id": "L0002_T0001", "lineId": "L0002", "deva": "॥", "kind": "punct"},
        ],
    }

    karaoke = build_karaoke_payload(payload)

    assert [line["lineId"] for line in karaoke["lines"]] == ["L0001", "L0002"]
    assert [t["id"] for t in karaoke["lines"][0]["tokens"]] == ["L0001_T0001", "L0001_T0002"]
    assert [t["id"] for t in karaoke["lines"][1]["tokens"]] == ["L0002_T0001"]


def test_svara_marks_are_preserved_byte_for_byte(tmp_path: Path) -> None:
    svara_token = "वि॑द्विषा॒वहै᳚"
    tokens = {
        "slug": "ganapati",
        "tokens": [
            {"id": "L0001_T0001", "lineId": "L0001", "deva": svara_token, "kind": "word"},
        ],
    }

    tokens_path = tmp_path / "tokens.json"
    tokens_path.write_text(json.dumps(tokens, ensure_ascii=False, indent=2), encoding="utf-8")

    output_path = write_karaoke_json(tokens_path=tokens_path, out_dir=tmp_path)
    karaoke = json.loads(output_path.read_text(encoding="utf-8"))
    out_token = karaoke["lines"][0]["tokens"][0]["deva"]

    assert out_token == svara_token
    assert out_token.encode("utf-8") == svara_token.encode("utf-8")


def test_join_to_next_behavior_for_danda_and_digits() -> None:
    payload = {
        "slug": "ganapati",
        "tokens": [
            {"id": "L0001_T0001", "lineId": "L0001", "deva": "शान्तिः", "kind": "word"},
            {"id": "L0001_T0002", "lineId": "L0001", "deva": "॥", "kind": "punct"},
            {"id": "L0001_T0003", "lineId": "L0001", "deva": "10", "kind": "punct"},
            {"id": "L0001_T0004", "lineId": "L0001", "deva": "॥", "kind": "punct"},
            {"id": "L0001_T0005", "lineId": "L0001", "deva": "इति", "kind": "word"},
        ],
    }

    karaoke = build_karaoke_payload(payload)
    tokens = karaoke["lines"][0]["tokens"]

    assert tokens[0]["joinToNext"] is True
    assert tokens[1]["joinToNext"] is True
    assert tokens[2]["joinToNext"] is True
    assert tokens[3]["joinToNext"] is False
    assert tokens[4]["joinToNext"] is False
