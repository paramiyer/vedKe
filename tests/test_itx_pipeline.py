from __future__ import annotations

import json
from pathlib import Path

from services.itx_pipeline.parser import (
    build_tokens_payload,
    iter_content_lines,
    tokenize_deva_line,
    transliterate_itx_to_deva,
    write_tokens_json,
)
from services.itx_pipeline.validation import validate_tokens_payload


def test_iter_content_lines_skips_non_content_and_stops_at_hash_hash() -> None:
    lines = Path("tests/fixtures/sample.itx").read_text(encoding="utf-8").splitlines()

    content = list(iter_content_lines(lines))

    assert content == [
        "gaNeshAtharvashIrSham",
        "OM bha\\`dra.n karNe\\'bhiH devAH .",
        "sa{\\m+}hi\\'tA sa\\`ndhiH ..",
    ]


def test_transliterate_itx_to_deva_handles_svara_and_m_plus() -> None:
    assert transliterate_itx_to_deva("OM bha\\`dra.n") == "ॐ भ॒द्रं"
    assert transliterate_itx_to_deva("sa{\\m+}hi\\'tA") == "सँहि॑ता"


def test_build_tokens_payload_deterministic_ids_and_kinds() -> None:
    payload = build_tokens_payload(slug="ganapati", itx_path=Path("tests/fixtures/sample.itx"))

    assert payload["slug"] == "ganapati"
    assert payload["tokens"][0] == {
        "id": "L0001_T0001",
        "lineId": "L0001",
        "deva": "गणेशाथर्वशीर्षम्",
        "kind": "word",
    }

    second_line = [t for t in payload["tokens"] if t["lineId"] == "L0002"]
    assert second_line[:5] == [
        {"id": "L0002_T0001", "lineId": "L0002", "deva": "ॐ", "kind": "word"},
        {"id": "L0002_T0002", "lineId": "L0002", "deva": "भ॒द्रं", "kind": "word"},
        {"id": "L0002_T0003", "lineId": "L0002", "deva": "कर्णे॑भिः", "kind": "word"},
        {"id": "L0002_T0004", "lineId": "L0002", "deva": "देवाः", "kind": "word"},
        {"id": "L0002_T0005", "lineId": "L0002", "deva": "।", "kind": "punct"},
    ]


def test_write_tokens_json_writes_expected_file(tmp_path: Path) -> None:
    output_path = write_tokens_json(
        slug="ganapati",
        itx_path=Path("tests/fixtures/sample.itx"),
        out_dir=tmp_path,
    )

    assert output_path.name == "tokens.json"
    data = json.loads(output_path.read_text(encoding="utf-8"))
    assert data["slug"] == "ganapati"
    assert len(data["tokens"]) > 0


def test_danda_tokens_are_punct() -> None:
    pairs = tokenize_deva_line("ॐ शान्तिः । शान्तिः ॥")
    dandas = [p for p in pairs if p[0] in {"।", "॥"}]
    assert dandas == [("।", "punct"), ("॥", "punct")]


def test_digit_merge_keeps_10_single_punct_token() -> None:
    pairs = tokenize_deva_line("॥10॥")
    assert pairs == [("॥", "punct"), ("10", "punct"), ("॥", "punct")]


def test_validate_tokens_rejects_stray_tex_characters() -> None:
    payload = {
        "slug": "ganapati",
        "tokens": [
            {"id": "L0001_T0001", "lineId": "L0001", "deva": "दे\\व", "kind": "word"},
        ],
    }
    errors = validate_tokens_payload(payload)
    assert any("forbidden TeX/ASCII" in err["message"] for err in errors)
