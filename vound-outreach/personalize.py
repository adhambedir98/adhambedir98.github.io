"""
Step 5 — light personalization.

Produces ONE specific, in-voice opening line per contact, built only from
PUBLIC-ish fields (role, company, location, industry). It deliberately does NOT
use the ``notes`` field, which holds internal strategy ("door-opener", "verify
degree before outreach", "do NOT use Stanford angle", etc.) that must never land
in an outreach message.

These lines are a starting suggestion. Every first-touch is reviewed by Adham
before he sends it in the HBS composer, so he refines or replaces the line. The
dashboard highlights it and shows the internal notes separately. When the agent is
run interactively via Claude Code, the ``PERSONALIZER`` seam lets Claude write a
more genuine, less templated line per contact.

Voice rules honored: direct, warm, no em dashes, no AI buzzwords, no filler.
"""

from __future__ import annotations

import hashlib
from typing import Callable

INDUSTRY_HUMAN = {
    "agriculture": "agriculture",
    "food_and_beverage": "food and beverage",
    "manufacturing": "manufacturing",
    "logistics_and_warehousing": "logistics",
    "construction": "construction",
    "mining": "mining",
    "recycling_and_waste": "recycling and waste",
    "auto_and_fleet": "fleet and equipment",
    "ports": "ports and container logistics",
    "other": None,
}


def _stable_choice(seed: str, n: int) -> int:
    """Deterministic per-contact pick so reruns are stable but phrasing varies."""
    return int(hashlib.sha256(seed.encode()).hexdigest(), 16) % n


def _clean_role(role: str | None) -> str | None:
    if not role:
        return None
    r = role.strip().strip("()").strip()
    return r or None


def default_personalizer(contact: dict) -> str | None:
    company = (contact.get("company") or "").strip()
    if not company:
        return None
    role = _clean_role(contact.get("role"))
    location = (contact.get("location") or "").strip() or None
    industry_h = INDUSTRY_HUMAN.get((contact.get("industry") or "").strip())

    options: list[str] = []
    if role:
        options.append(
            f"Your work as {role} at {company} is close to the kind of operation "
            "we are trying to learn from this summer."
        )
    if industry_h and location:
        options.append(
            f"I came across {company} while looking at {industry_h} operators around "
            f"{location}, and I would value how you see things from where you sit."
        )
    if industry_h:
        options.append(
            f"I have been mapping how {industry_h} operators actually run, and "
            f"{company} is exactly the kind of business I want to understand."
        )
    if role:
        options.append(f"I would genuinely value your read as {role} at {company}.")
    if not options:
        options.append(f"I have been reading about {company} and would value your perspective.")

    return options[_stable_choice(company + "|" + (role or ""), len(options))]


# Seam: Claude Code can replace this at runtime with a function that writes a more
# genuine line per contact (e.g. personalize.PERSONALIZER = my_fn).
PERSONALIZER: Callable[[dict], "str | None"] = default_personalizer


def personalize_line(contact: dict) -> str | None:
    try:
        return PERSONALIZER(contact)
    except Exception:
        return default_personalizer(contact)
