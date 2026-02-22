from __future__ import annotations

import json
import math
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import difflib

from scripts.alignment.text_normalize import is_speakable_token, normalize_token_text


@dataclass(frozen=True)
class BaselineToken:
    i: int
    token_id: str
    line_id: str
    t: str
    kind: str
    norm: str
    speakable: bool


@dataclass(frozen=True)
class HighlighterEntry:
    i: int
    token_id: str
    page: int
    x: float
    y: float
    w: float
    h: float


@dataclass(frozen=True)
class RecognizedWord:
    norm: str
    s: int
    e: int
    c: float


def _run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=False, capture_output=True, text=True)


def _require_tool(name: str, hint: str) -> None:
    if shutil.which(name) is None:
        raise RuntimeError(f"Missing tool '{name}'. {hint}")


def load_tokens(tokens_path: Path) -> tuple[str, list[BaselineToken]]:
    payload = json.loads(tokens_path.read_text(encoding="utf-8"))
    slug = str(payload.get("slug", ""))
    raw_tokens = payload.get("tokens")
    if not isinstance(raw_tokens, list):
        raise ValueError("tokens.json missing tokens[]")

    tokens: list[BaselineToken] = []
    for i, item in enumerate(raw_tokens):
        if not isinstance(item, dict):
            raise ValueError(f"tokens[{i}] must be object")
        token_id = str(item.get("id", ""))
        line_id = str(item.get("lineId", ""))
        deva = str(item.get("deva", ""))
        kind = str(item.get("kind", ""))
        if not token_id or not line_id or not deva:
            raise ValueError(f"tokens[{i}] missing id/lineId/deva")
        norm = normalize_token_text(deva)
        speakable = is_speakable_token(kind, norm)
        tokens.append(
            BaselineToken(i=i, token_id=token_id, line_id=line_id, t=deva, kind=kind, norm=norm, speakable=speakable)
        )
    return slug, tokens


def load_highlighter(highlighter_path: Path) -> list[HighlighterEntry]:
    payload = json.loads(highlighter_path.read_text(encoding="utf-8"))
    pages = payload.get("pages")
    if not isinstance(pages, dict):
        raise ValueError("highlighter.json/highlights.json missing pages object")

    flat: list[HighlighterEntry] = []
    idx = 0
    def page_key_to_int(value: str) -> int:
        try:
            return int(value)
        except ValueError:
            return 10**9

    for page_key in sorted(pages.keys(), key=page_key_to_int):
        entries = pages.get(page_key)
        if not isinstance(entries, list):
            continue
        page_num = page_key_to_int(page_key)
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            token_id = str(entry.get("id", ""))
            if not token_id:
                continue
            flat.append(
                HighlighterEntry(
                    i=idx,
                    token_id=token_id,
                    page=page_num,
                    x=float(entry.get("x", 0.0)),
                    y=float(entry.get("y", 0.0)),
                    w=float(entry.get("w", 0.0)),
                    h=float(entry.get("h", 0.0)),
                )
            )
            idx += 1
    return flat


def assert_index_invariants(tokens: list[BaselineToken], highlighter: list[HighlighterEntry]) -> None:
    if len(tokens) != len(highlighter):
        raise ValueError(
            f"Token count mismatch: tokens={len(tokens)} highlighter={len(highlighter)}. "
            "tokens.json is the baseline source of truth."
        )
    for i, (token, hl) in enumerate(zip(tokens, highlighter)):
        if token.token_id != hl.token_id:
            raise ValueError(
                f"Index invariant failed at i={i}: tokens.id={token.token_id} != highlighter.id={hl.token_id}"
            )


def ensure_wav(audio_path: Path) -> Path:
    _require_tool("ffmpeg", "Install with: brew install ffmpeg")
    wav_path = audio_path.with_suffix(".16k_mono.wav")
    if wav_path.exists() and wav_path.stat().st_mtime >= audio_path.stat().st_mtime:
        return wav_path

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(audio_path),
        "-ac",
        "1",
        "-ar",
        "16000",
        str(wav_path),
    ]
    result = _run(cmd)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg conversion failed: {result.stderr.strip()}")
    return wav_path


def probe_duration_ms(audio_path: Path) -> int:
    _require_tool("ffprobe", "Install with: brew install ffmpeg")
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(audio_path),
    ]
    result = _run(cmd)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr.strip()}")
    seconds = float((result.stdout or "0").strip() or 0)
    return max(0, int(round(seconds * 1000)))


def _extract_whisperx_words(wav_path: Path) -> list[RecognizedWord]:
    # Import inside function so fallback works when whisperx isn't installed.
    import whisperx  # type: ignore

    model = whisperx.load_model("small", device="cpu")
    result: dict[str, Any] = model.transcribe(str(wav_path), batch_size=8)

    words: list[RecognizedWord] = []
    for segment in result.get("segments", []):
        for word in segment.get("words", []) or []:
            raw = str(word.get("word", "")).strip()
            norm = normalize_token_text(raw)
            if not norm:
                continue
            s = int(round(float(word.get("start", 0.0)) * 1000))
            e = int(round(float(word.get("end", word.get("start", 0.0))) * 1000))
            c = float(word.get("score", word.get("confidence", 0.0)) or 0.0)
            words.append(RecognizedWord(norm=norm, s=max(0, s), e=max(0, e), c=max(0.0, min(1.0, c))))
    return words


def _map_recognized_to_speakable(tokens: list[BaselineToken], words: list[RecognizedWord]) -> dict[int, RecognizedWord]:
    speakable_indices = [t.i for t in tokens if t.speakable]
    speakable_norms = [tokens[i].norm for i in speakable_indices]
    word_norms = [w.norm for w in words]

    matcher = difflib.SequenceMatcher(a=speakable_norms, b=word_norms, autojunk=False)
    mapped: dict[int, RecognizedWord] = {}
    for block in matcher.get_matching_blocks():
        if block.size <= 0:
            continue
        for offset in range(block.size):
            token_global_idx = speakable_indices[block.a + offset]
            word_idx = block.b + offset
            if 0 <= word_idx < len(words):
                mapped[token_global_idx] = words[word_idx]
    return mapped


def _interpolate_speakable_timings(tokens: list[BaselineToken], matched: dict[int, RecognizedWord], duration_ms: int) -> list[dict[str, Any]]:
    timings: list[dict[str, Any]] = [
        {"s": None, "e": None, "c": 0.0}
        for _ in tokens
    ]

    for i, word in matched.items():
        timings[i]["s"] = word.s
        timings[i]["e"] = max(word.s, word.e)
        timings[i]["c"] = word.c

    speakable_indices = [t.i for t in tokens if t.speakable]
    if not speakable_indices:
        return timings

    default_ms = max(120, int(duration_ms / max(1, len(speakable_indices))))

    known = [i for i in speakable_indices if timings[i]["s"] is not None]
    if not known:
        cursor = 0
        for i in speakable_indices:
            s = cursor
            e = min(duration_ms, s + default_ms)
            timings[i]["s"] = s
            timings[i]["e"] = e
            timings[i]["c"] = 0.25
            cursor = e
        return timings

    for idx, i in enumerate(speakable_indices):
        if timings[i]["s"] is not None:
            continue
        prev_known = next((k for k in reversed(speakable_indices[:idx]) if timings[k]["s"] is not None), None)
        next_known = next((k for k in speakable_indices[idx + 1 :] if timings[k]["s"] is not None), None)
        if prev_known is not None and next_known is not None:
            gap_indices = [j for j in speakable_indices if prev_known < j < next_known and timings[j]["s"] is None]
            count = len(gap_indices) + 1
            start = int(timings[prev_known]["e"])
            end = int(timings[next_known]["s"])
            span = max(count * 60, end - start)
            step = max(40, span // count)
            pos = start
            for j in gap_indices:
                timings[j]["s"] = pos
                timings[j]["e"] = min(end, pos + step)
                timings[j]["c"] = 0.35
                pos += step
        elif prev_known is None and next_known is not None:
            end = int(timings[next_known]["s"])
            s = max(0, end - default_ms)
            timings[i]["s"] = s
            timings[i]["e"] = end
            timings[i]["c"] = 0.3
        elif prev_known is not None:
            start = int(timings[prev_known]["e"])
            end = min(duration_ms, start + default_ms)
            timings[i]["s"] = start
            timings[i]["e"] = end
            timings[i]["c"] = 0.3

    return timings


def inject_non_speakable_micro_timings(tokens: list[BaselineToken], base_timings: list[dict[str, Any]], duration_ms: int) -> list[dict[str, Any]]:
    timings = [dict(item) for item in base_timings]

    for i, token in enumerate(tokens):
        if token.speakable:
            continue
        micro = max(30, min(80, 35 + len(token.t) * 5))

        prev_e = 0
        for j in range(i - 1, -1, -1):
            if timings[j]["e"] is not None:
                prev_e = int(timings[j]["e"])
                break

        next_s = duration_ms
        for j in range(i + 1, len(tokens)):
            if timings[j]["s"] is not None:
                next_s = int(timings[j]["s"])
                break

        s = prev_e
        e = min(next_s, s + micro)
        if e < s:
            e = s
        timings[i]["s"] = s
        timings[i]["e"] = e
        timings[i]["c"] = 0.2

    return timings


def _enforce_monotonic(timings: list[dict[str, Any]], duration_ms: int) -> list[dict[str, Any]]:
    prev_e = 0
    for i, item in enumerate(timings):
        s = int(item.get("s") or 0)
        e = int(item.get("e") or s)
        s = max(prev_e, min(s, duration_ms))
        e = max(s, min(e, duration_ms))
        item["s"] = s
        item["e"] = e
        prev_e = e

    for i in range(len(timings) - 1):
        if timings[i]["e"] > timings[i + 1]["s"]:
            timings[i + 1]["s"] = timings[i]["e"]
            if timings[i + 1]["e"] < timings[i + 1]["s"]:
                timings[i + 1]["e"] = timings[i + 1]["s"]
    return timings


def fallback_segment_timings(tokens: list[BaselineToken], highlighter: list[HighlighterEntry], duration_ms: int) -> list[dict[str, Any]]:
    # Segment by baseline line id (or fallback to visual y-clusters if needed).
    by_line: dict[str, list[int]] = {}
    for token in tokens:
        by_line.setdefault(token.line_id, []).append(token.i)

    lines = list(by_line.values())
    line_weights = []
    for token_indices in lines:
        char_count = sum(max(1, len(tokens[i].norm or tokens[i].t)) for i in token_indices)
        line_weights.append(char_count)

    total_weight = sum(line_weights) or 1
    timings: list[dict[str, Any]] = [{"s": 0, "e": 0, "c": 0.15} for _ in tokens]
    cursor = 0
    for line_indices, line_weight in zip(lines, line_weights):
        line_span = max(80, int(round(duration_ms * (line_weight / total_weight))))
        line_start = cursor
        line_end = min(duration_ms, line_start + line_span)
        cursor = line_end

        token_weights = [max(1, len(tokens[i].norm or tokens[i].t)) for i in line_indices]
        token_total = sum(token_weights) or 1
        pos = line_start
        for idx, token_i in enumerate(line_indices):
            weight = token_weights[idx]
            dur = max(30, int(round((line_end - line_start) * (weight / token_total))))
            s = pos
            e = min(line_end, s + dur)
            timings[token_i] = {"s": s, "e": max(s, e), "c": 0.2}
            pos = e

    return _enforce_monotonic(timings, duration_ms)


def build_timings(
    tokens: list[BaselineToken],
    highlighter: list[HighlighterEntry],
    audio_path: Path,
    audio_url: str,
    engine: str,
    duration_ms_override: int | None = None,
) -> dict[str, Any]:
    assert_index_invariants(tokens, highlighter)
    if duration_ms_override is not None:
        duration_ms = max(0, int(duration_ms_override))
    else:
        duration_ms = probe_duration_ms(audio_path)

    method = "fallback"
    final_timings: list[dict[str, Any]]

    if engine == "whisperx":
        try:
            wav_path = ensure_wav(audio_path)
            words = _extract_whisperx_words(wav_path)
            matched = _map_recognized_to_speakable(tokens, words)
            speakable_count = len([t for t in tokens if t.speakable])
            coverage = (len(matched) / speakable_count) if speakable_count > 0 else 1.0
            if coverage >= 0.55:
                partial = _interpolate_speakable_timings(tokens, matched, duration_ms)
                partial = inject_non_speakable_micro_timings(tokens, partial, duration_ms)
                final_timings = _enforce_monotonic(partial, duration_ms)
                method = "whisperx"
            else:
                final_timings = fallback_segment_timings(tokens, highlighter, duration_ms)
        except Exception:
            final_timings = fallback_segment_timings(tokens, highlighter, duration_ms)
    else:
        final_timings = fallback_segment_timings(tokens, highlighter, duration_ms)

    payload_tokens = []
    for token, timing in zip(tokens, final_timings):
        payload_tokens.append(
            {
                "i": token.i,
                "t": token.t,
                "norm": token.norm,
                "s": int(timing["s"]),
                "e": int(timing["e"]),
                "c": round(float(timing.get("c", 0.0)), 4),
            }
        )

    audio_file = str(audio_path).replace("\\", "/")
    public_prefix = "apps/web/public/"
    if public_prefix in audio_file:
        audio_file = audio_file.split(public_prefix, 1)[1]

    return {
        "audio": {
            "source": "youtube",
            "url": audio_url,
            "file": audio_file,
            "duration_ms": duration_ms,
        },
        "tokens": payload_tokens,
        "meta": {
            "method": method,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    }


def save_timings(payload: dict[str, Any], out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return out_path


def validate_timings_payload(tokens: list[BaselineToken], highlighter: list[HighlighterEntry], timings_payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    out_tokens = timings_payload.get("tokens")
    if not isinstance(out_tokens, list):
        return ["timings.json missing tokens array"]

    if len(tokens) != len(highlighter):
        errors.append(f"count mismatch: tokens={len(tokens)} highlighter={len(highlighter)}")
    if len(tokens) != len(out_tokens):
        errors.append(f"count mismatch: tokens={len(tokens)} timings={len(out_tokens)}")

    audio = timings_payload.get("audio")
    duration_ms = int((audio or {}).get("duration_ms", 0)) if isinstance(audio, dict) else 0

    prev_s = -1
    prev_e = -1
    for i, (token, hl) in enumerate(zip(tokens, highlighter)):
        if i >= len(out_tokens):
            break
        row = out_tokens[i]
        if not isinstance(row, dict):
            errors.append(f"timings[{i}] must be object")
            continue
        idx = int(row.get("i", -1))
        text = str(row.get("t", ""))
        s = int(row.get("s", -1))
        e = int(row.get("e", -1))

        if idx != i:
            errors.append(f"timings[{i}].i must equal {i}, got {idx}")
        if text != token.t:
            errors.append(f"timings[{i}].t mismatch: expected '{token.t}', got '{text}'")
        if token.token_id != hl.token_id:
            errors.append(f"index invariant failed at {i}: token id vs highlighter id")
        if s < 0 or e < 0:
            errors.append(f"timings[{i}] negative s/e")
        if s > e:
            errors.append(f"timings[{i}] has s > e ({s} > {e})")
        if prev_e > s:
            errors.append(f"timings monotonic violation at {i}: prev e={prev_e} > s={s}")
        if prev_s > s:
            errors.append(f"timings start monotonic violation at {i}: prev s={prev_s} > s={s}")
        prev_s = s
        prev_e = e

    if duration_ms > 0 and len(out_tokens) > 0:
        last_e = int(out_tokens[-1].get("e", 0)) if isinstance(out_tokens[-1], dict) else 0
        if last_e > duration_ms + 250:
            errors.append(f"timings exceed audio duration: last_e={last_e} > duration_ms={duration_ms}")
    return errors


def find_active_token_index(timings_tokens: list[dict[str, Any]], t_ms: float) -> int:
    if not timings_tokens:
        return -1
    lo = 0
    hi = len(timings_tokens) - 1
    target = int(math.floor(t_ms))
    while lo <= hi:
        mid = (lo + hi) // 2
        row = timings_tokens[mid]
        s = int(row.get("s", 0))
        e = int(row.get("e", s))
        if target < s:
            hi = mid - 1
        elif target > e:
            lo = mid + 1
        else:
            return mid
    return max(0, min(len(timings_tokens) - 1, lo))


def warp_time_with_anchors(base_time_ms: float, anchors: list[dict[str, float]], base_token_times: list[float]) -> float:
    if not anchors:
        return base_time_ms
    clean = sorted(
        [a for a in anchors if "token_index" in a and "audio_time_ms" in a],
        key=lambda a: (float(a["token_index"]), float(a["audio_time_ms"])),
    )
    if not clean:
        return base_time_ms

    points = []
    for anchor in clean:
        idx = int(anchor["token_index"])
        if idx < 0 or idx >= len(base_token_times):
            continue
        points.append((base_token_times[idx], float(anchor["audio_time_ms"])))
    if not points:
        return base_time_ms

    points.sort(key=lambda p: p[1])

    if base_time_ms <= points[0][1]:
        return points[0][0] + (base_time_ms - points[0][1])
    if base_time_ms >= points[-1][1]:
        return points[-1][0] + (base_time_ms - points[-1][1])

    for (base_a, audio_a), (base_b, audio_b) in zip(points, points[1:], strict=False):
        if audio_a <= base_time_ms <= audio_b:
            span = max(1e-6, audio_b - audio_a)
            ratio = (base_time_ms - audio_a) / span
            return base_a + ratio * (base_b - base_a)

    return base_time_ms


def load_anchor_points(anchors_path: Path) -> list[dict[str, float]]:
    payload = json.loads(anchors_path.read_text(encoding="utf-8"))
    raw_points: Any
    if isinstance(payload, list):
        raw_points = payload
    elif isinstance(payload, dict):
        raw_points = payload.get("anchors", [])
    else:
        raw_points = []

    if not isinstance(raw_points, list):
        raise ValueError("anchors payload must be an array or object with anchors[]")

    points: list[dict[str, float]] = []
    seen_token_indices: set[int] = set()
    for row in raw_points:
        if not isinstance(row, dict):
            continue
        token_index = int(row.get("token_index", -1))
        audio_time_ms = float(row.get("audio_time_ms", -1))
        if token_index < 0 or audio_time_ms < 0:
            continue
        # Keep the first anchor for a token index to maintain deterministic behavior.
        if token_index in seen_token_indices:
            continue
        seen_token_indices.add(token_index)
        points.append({"token_index": float(token_index), "audio_time_ms": audio_time_ms})

    points.sort(key=lambda a: (a["token_index"], a["audio_time_ms"]))
    return points


def map_base_to_audio_time(base_time_ms: float, anchors: list[dict[str, float]], base_token_times: list[float]) -> float:
    if not anchors:
        return base_time_ms
    clean = sorted(
        [a for a in anchors if "token_index" in a and "audio_time_ms" in a],
        key=lambda a: (float(a["token_index"]), float(a["audio_time_ms"])),
    )
    if not clean:
        return base_time_ms

    points = []
    for anchor in clean:
        idx = int(anchor["token_index"])
        if idx < 0 or idx >= len(base_token_times):
            continue
        points.append((base_token_times[idx], float(anchor["audio_time_ms"])))
    if not points:
        return base_time_ms

    # Inverse of warp_time_with_anchors (audio->base): map base->audio.
    points.sort(key=lambda p: p[0])

    if base_time_ms <= points[0][0]:
        return points[0][1] + (base_time_ms - points[0][0])
    if base_time_ms >= points[-1][0]:
        return points[-1][1] + (base_time_ms - points[-1][0])

    for (base_a, audio_a), (base_b, audio_b) in zip(points, points[1:], strict=False):
        if base_a <= base_time_ms <= base_b:
            span = max(1e-6, base_b - base_a)
            ratio = (base_time_ms - base_a) / span
            return audio_a + ratio * (audio_b - audio_a)
    return base_time_ms


def retime_payload_with_anchors(timings_payload: dict[str, Any], anchors: list[dict[str, float]]) -> dict[str, Any]:
    tokens_raw = timings_payload.get("tokens")
    if not isinstance(tokens_raw, list):
        raise ValueError("timings.json missing tokens[]")
    if not anchors:
        return timings_payload

    base_token_times: list[float] = []
    for row in tokens_raw:
        if not isinstance(row, dict):
            base_token_times.append(0.0)
            continue
        base_token_times.append(float(row.get("s", 0)))

    remapped: list[dict[str, Any]] = []
    for idx, row in enumerate(tokens_raw):
        if not isinstance(row, dict):
            continue
        s = float(row.get("s", 0))
        e = float(row.get("e", s))
        s_new = int(round(map_base_to_audio_time(s, anchors, base_token_times)))
        e_new = int(round(map_base_to_audio_time(e, anchors, base_token_times)))
        remapped.append(
            {
                "i": int(row.get("i", idx)),
                "t": str(row.get("t", "")),
                "norm": str(row.get("norm", "")),
                "s": s_new,
                "e": max(s_new, e_new),
                "c": float(row.get("c", 0.0)),
            }
        )

    audio = timings_payload.get("audio")
    duration_ms = int(audio.get("duration_ms", 0)) if isinstance(audio, dict) else 0
    duration_cap = max(duration_ms, max((int(item["e"]) for item in remapped), default=0))
    remapped = _enforce_monotonic(remapped, duration_cap)

    out = dict(timings_payload)
    out["tokens"] = remapped
    if isinstance(audio, dict):
        patched_audio = dict(audio)
        patched_audio["duration_ms"] = max(duration_ms, int(remapped[-1]["e"]) if remapped else duration_ms)
        out["audio"] = patched_audio

    meta = out.get("meta")
    method = "anchors"
    if isinstance(meta, dict):
        prev_method = str(meta.get("method", "")).strip()
        if prev_method:
            method = f"{prev_method}+anchors"
        patched_meta = dict(meta)
    else:
        patched_meta = {}
    patched_meta["method"] = method
    patched_meta["anchor_count"] = len(anchors)
    patched_meta["retimed_at"] = datetime.now(timezone.utc).isoformat()
    out["meta"] = patched_meta

    return out


def _interp_index(values: list[float], idx: float) -> float:
    if not values:
        return 0.0
    if idx <= 0:
        if len(values) == 1:
            return values[0]
        return values[0] + idx * (values[1] - values[0])
    last = len(values) - 1
    if idx >= last:
        if len(values) == 1:
            return values[0]
        return values[last] + (idx - last) * (values[last] - values[last - 1])
    lo = int(math.floor(idx))
    hi = min(last, lo + 1)
    if hi == lo:
        return values[lo]
    ratio = idx - lo
    return values[lo] + ratio * (values[hi] - values[lo])


def retime_payload_with_token_offset(timings_payload: dict[str, Any], offset_tokens: float) -> dict[str, Any]:
    tokens_raw = timings_payload.get("tokens")
    if not isinstance(tokens_raw, list):
        raise ValueError("timings.json missing tokens[]")
    if abs(offset_tokens) < 1e-9:
        return timings_payload

    starts: list[float] = []
    ends: list[float] = []
    for row in tokens_raw:
        if not isinstance(row, dict):
            starts.append(0.0)
            ends.append(0.0)
            continue
        s = float(row.get("s", 0))
        e = float(row.get("e", s))
        starts.append(s)
        ends.append(max(s, e))

    remapped: list[dict[str, Any]] = []
    for i, row in enumerate(tokens_raw):
        if not isinstance(row, dict):
            continue
        src = i + offset_tokens
        s_new = int(round(_interp_index(starts, src)))
        e_new = int(round(_interp_index(ends, src)))
        remapped.append(
            {
                "i": int(row.get("i", i)),
                "t": str(row.get("t", "")),
                "norm": str(row.get("norm", "")),
                "s": s_new,
                "e": max(s_new, e_new),
                "c": float(row.get("c", 0.0)),
            }
        )

    audio = timings_payload.get("audio")
    duration_ms = int(audio.get("duration_ms", 0)) if isinstance(audio, dict) else 0
    duration_cap = max(duration_ms, max((int(item["e"]) for item in remapped), default=0))
    remapped = _enforce_monotonic(remapped, duration_cap)

    out = dict(timings_payload)
    out["tokens"] = remapped
    if isinstance(audio, dict):
        patched_audio = dict(audio)
        patched_audio["duration_ms"] = max(duration_ms, int(remapped[-1]["e"]) if remapped else duration_ms)
        out["audio"] = patched_audio

    meta = out.get("meta")
    method = "token-offset"
    if isinstance(meta, dict):
        prev_method = str(meta.get("method", "")).strip()
        if prev_method:
            method = f"{prev_method}+token-offset"
        patched_meta = dict(meta)
    else:
        patched_meta = {}
    patched_meta["method"] = method
    patched_meta["offset_tokens"] = offset_tokens
    patched_meta["retimed_at"] = datetime.now(timezone.utc).isoformat()
    out["meta"] = patched_meta

    return out
