from __future__ import annotations

from services.itx_pipeline.alignment import (
    BaselineToken,
    RecognizedWord,
    _map_recognized_to_speakable,
    inject_non_speakable_micro_timings,
    retime_payload_with_anchors,
    retime_payload_with_token_offset,
    warp_time_with_anchors,
)
from scripts.alignment.text_normalize import normalize_token_text


def _token(i: int, text: str, kind: str = "word") -> BaselineToken:
    norm = normalize_token_text(text)
    return BaselineToken(
        i=i,
        token_id=f"L0001_T{i+1:04d}",
        line_id="L0001",
        t=text,
        kind=kind,
        norm=norm,
        speakable=(kind == "word" and bool(norm)),
    )


def test_normalize_token_text_removes_marks_and_symbols() -> None:
    assert normalize_token_text("भ॒द्रं") == "भदर"
    assert normalize_token_text("॥") == ""


def test_token_mapping_matches_speakable_sequence() -> None:
    tokens = [_token(0, "भ॒द्रं"), _token(1, "।", "punct"), _token(2, "कर्णे॑भिः")]
    words = [RecognizedWord(norm=tokens[0].norm, s=100, e=260, c=0.9), RecognizedWord(norm=tokens[2].norm, s=400, e=700, c=0.85)]
    mapped = _map_recognized_to_speakable(tokens, words)
    assert mapped[0].s == 100
    assert mapped[2].e == 700
    assert 1 not in mapped


def test_inject_non_speakable_micro_timings_keeps_coverage() -> None:
    tokens = [_token(0, "गण"), _token(1, "।", "punct"), _token(2, "पतिः")]
    base = [
        {"s": 100, "e": 300, "c": 0.9},
        {"s": None, "e": None, "c": 0.0},
        {"s": 450, "e": 700, "c": 0.9},
    ]
    out = inject_non_speakable_micro_timings(tokens, base, duration_ms=1000)
    assert out[1]["s"] >= out[0]["e"]
    assert out[1]["e"] <= out[2]["s"]
    assert out[1]["e"] >= out[1]["s"]


def test_anchor_warp_piecewise_linear_interpolation() -> None:
    base_token_times = [0.0, 1000.0, 2000.0, 3000.0]
    anchors = [
        {"token_index": 1, "audio_time_ms": 1100.0},
        {"token_index": 3, "audio_time_ms": 3300.0},
    ]
    # halfway between anchor audio points should map halfway between base points
    warped = warp_time_with_anchors(2200.0, anchors, base_token_times)
    assert 1990 <= warped <= 2010


def test_retime_payload_with_anchors_applies_piecewise_shift() -> None:
    payload = {
        "audio": {"source": "youtube", "url": "", "file": "audio.mp3", "duration_ms": 3000},
        "tokens": [
            {"i": 0, "t": "ग", "norm": "ग", "s": 0, "e": 100, "c": 0.7},
            {"i": 1, "t": "ण", "norm": "ण", "s": 100, "e": 200, "c": 0.7},
            {"i": 2, "t": "प", "norm": "प", "s": 200, "e": 300, "c": 0.7},
        ],
        "meta": {"method": "fallback", "created_at": "2026-01-01T00:00:00+00:00"},
    }
    anchors = [
        {"token_index": 0.0, "audio_time_ms": 50.0},
        {"token_index": 2.0, "audio_time_ms": 350.0},
    ]
    out = retime_payload_with_anchors(payload, anchors)
    out_tokens = out["tokens"]
    assert out_tokens[0]["s"] == 50
    assert out_tokens[1]["s"] == 200
    assert out_tokens[2]["s"] == 350
    assert out["meta"]["method"] == "fallback+anchors"
    assert out["meta"]["anchor_count"] == 2


def test_retime_payload_with_token_offset_delays_uniformly() -> None:
    payload = {
        "audio": {"source": "youtube", "url": "", "file": "audio.mp3", "duration_ms": 6000},
        "tokens": [
            {"i": 0, "t": "अ", "norm": "अ", "s": 0, "e": 100, "c": 0.7},
            {"i": 1, "t": "आ", "norm": "आ", "s": 100, "e": 200, "c": 0.7},
            {"i": 2, "t": "इ", "norm": "इ", "s": 200, "e": 300, "c": 0.7},
            {"i": 3, "t": "ई", "norm": "ई", "s": 300, "e": 400, "c": 0.7},
        ],
        "meta": {"method": "fallback", "created_at": "2026-01-01T00:00:00+00:00"},
    }
    out = retime_payload_with_token_offset(payload, offset_tokens=1.0)
    out_tokens = out["tokens"]
    assert out_tokens[0]["s"] == 100
    assert out_tokens[1]["s"] == 200
    assert out["meta"]["method"] == "fallback+token-offset"
    assert out["meta"]["offset_tokens"] == 1.0
