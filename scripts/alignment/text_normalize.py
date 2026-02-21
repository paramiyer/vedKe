from __future__ import annotations

import re
import unicodedata

_DEVANAGARI_LETTER_RE = re.compile(r"[\u0904-\u0939\u0958-\u0961\u0972-\u097F]+")


# Remove combining marks and retain only spoken letters for alignment matching.
def normalize_token_text(text: str) -> str:
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFD", text)
    stripped = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    letters = "".join(_DEVANAGARI_LETTER_RE.findall(stripped))
    return re.sub(r"\s+", "", unicodedata.normalize("NFC", letters))


def is_speakable_token(kind: str, norm: str) -> bool:
    if kind != "word":
        return False
    if not norm:
        return False
    return True
