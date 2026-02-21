from __future__ import annotations

from services.itx_pipeline.alignment import (
    BaselineToken,
    RecognizedWord,
    _map_recognized_to_speakable,
    inject_non_speakable_micro_timings,
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
