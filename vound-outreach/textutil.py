"""Small text helpers shared across the pipeline."""

from __future__ import annotations

import re

_TITLES = {"mr", "mrs", "ms", "dr", "prof", "mx", "sir"}


def first_name(contact_name: str | None) -> str:
    """Best-effort first name for the {first_name} merge token.

    Strips parentheticals and common titles; falls back to "there" so a draft is
    never addressed to an empty string.
    """
    if not contact_name:
        return "there"
    cleaned = re.sub(r"\(.*?\)", "", contact_name).strip()
    tokens = [t for t in cleaned.split() if t]
    while tokens and tokens[0].lower().strip(".") in _TITLES:
        tokens.pop(0)
    if not tokens:
        return "there"
    return tokens[0].strip(",.") or "there"


def truncate(text: str | None, n: int = 300) -> str:
    """First ~n chars, used for reply snippets."""
    text = (text or "").strip()
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"
