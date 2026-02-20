from __future__ import annotations

import json
from pathlib import Path

from services.itx_pipeline.highlights import (
    KaraokeToken,
    align_tokens_to_words,
    build_highlights_payload,
    load_karaoke_tokens,
    parse_pdftotext_bbox_xml,
)


def _sample_bbox_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8"?>
<doc>
  <page width="100.0" height="200.0">
    <word xMin="10.0" yMin="20.0" xMax="30.0" yMax="40.0">गणेशाथर्वशीर्षम्</word>
    <word xMin="32.0" yMin="20.0" xMax="38.0" yMax="40.0">।</word>
  </page>
</doc>
"""


def test_parse_pdftotext_bbox_xml_extracts_words() -> None:
    pages, words = parse_pdftotext_bbox_xml(_sample_bbox_xml())
    assert pages == {1: (100.0, 200.0)}
    assert [word.text for word in words] == ["गणेशाथर्वशीर्षम्", "।"]
    assert words[0].w == 20.0
    assert words[0].h == 20.0


def test_parse_pdftotext_bbox_xml_handles_xhtml_namespace() -> None:
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <doc>
      <page width="120.0" height="240.0">
        <word xMin="5" yMin="6" xMax="25" yMax="16">ॐ</word>
      </page>
    </doc>
  </body>
</html>
"""
    pages, words = parse_pdftotext_bbox_xml(xml)
    assert pages == {1: (120.0, 240.0)}
    assert [word.text for word in words] == ["ॐ"]


def test_parse_pdftotext_bbox_xml_splits_compound_punct_digit_words() -> None:
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<doc>
  <page width="100" height="100">
    <word xMin="10" yMin="10" xMax="30" yMax="20">॥14॥</word>
  </page>
</doc>
"""
    _, words = parse_pdftotext_bbox_xml(xml)
    assert [word.text for word in words] == ["॥", "14", "॥"]
    assert round(sum(word.w for word in words), 6) == 20.0


def test_align_tokens_to_words_handles_zwj_variants(tmp_path: Path) -> None:
    karaoke_path = tmp_path / "karaoke.json"
    karaoke_path.write_text(
        json.dumps(
            {
                "slug": "ganapati",
                "lines": [
                    {
                        "lineId": "L0001",
                        "tokens": [
                            {"id": "L0001_T0001", "deva": "श\u200dृणु॒याम॑", "kind": "word", "joinToNext": False},
                            {"id": "L0001_T0002", "deva": "।", "kind": "punct", "joinToNext": False},
                        ],
                    }
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    _, tokens = load_karaoke_tokens(karaoke_path)
    _, words = parse_pdftotext_bbox_xml(
        """<?xml version="1.0" encoding="UTF-8"?>
<doc>
  <page width="100.0" height="200.0">
    <word xMin="1" yMin="2" xMax="50" yMax="20">शृणु॒याम॑</word>
    <word xMin="51" yMin="2" xMax="55" yMax="20">।</word>
  </page>
</doc>
"""
    )

    aligned, missing = align_tokens_to_words(tokens=tokens, words=words)
    assert missing == []
    assert [(token.token_id, word.text) for token, word in aligned] == [
        ("L0001_T0001", "शृणु॒याम॑"),
        ("L0001_T0002", "।"),
    ]


def test_build_highlights_payload_applies_page_scale() -> None:
    _, words = parse_pdftotext_bbox_xml(_sample_bbox_xml())
    tokens = [
        KaraokeToken(
            token_id="L0001_T0001",
            line_id="L0001",
            deva="गणेशाथर्वशीर्षम्",
            kind="word",
            norm="गणेशाथर्वशीर्षम्",
            base_norm="गणेशाथर्वशीर्षम",
        ),
        KaraokeToken(token_id="L0001_T0002", line_id="L0001", deva="।", kind="punct", norm="।", base_norm="।"),
    ]

    aligned = [(tokens[0], words[0]), (tokens[1], words[1])]
    payload = build_highlights_payload(aligned=aligned, page_scales={1: (2.0, 2.0)})

    assert payload == {
        "pages": {
            "1": [
                {"id": "L0001_T0001", "kind": "word", "x": 20.0, "y": 40.0, "w": 40.0, "h": 40.0, "label": "गणेशाथर्वशीर्षम्"},
                {"id": "L0001_T0002", "kind": "punct", "x": 64.0, "y": 40.0, "w": 12.0, "h": 40.0, "label": "।"},
            ]
        }
    }
