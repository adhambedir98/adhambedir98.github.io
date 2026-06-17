"""
Step 1 — HBS alumni directory pull.

Terms of use and credentials (read this):
The HBS alumni directory is behind an authenticated login and its terms prohibit
bulk scraping. This module does NOT scrape and does NOT store any alumni
credentials. Instead it defines a clean interface, ``pull_directory()``, that is
fulfilled INTERACTIVELY by Claude in Chrome while Adham is logged into the
directory in his own browser. Claude reads what is already on the authenticated
page and writes the visible profiles to a small JSON handoff file
(``config.DIRECTORY_PULL_FILE``). This module only reads that handoff file.

If no handoff file is present (Claude in Chrome was not run this morning), the
step no-ops gracefully and tells Adham to do the pull manually. It never crashes
the pipeline.

The ``source`` parameter keeps MIT / Stanford pluggable later, but only HBS is
wired in v1.
"""

from __future__ import annotations

import json
import logging
import os

import config

log = logging.getLogger(__name__)


def pull_directory(source: str = "HBS") -> list[dict]:
    """Return profile dicts read from the Claude-in-Chrome handoff file.

    Each profile is ``{name, company, role, location, source}``. Returns ``[]``
    (a graceful no-op) when the handoff file is missing/empty, unreadable, or the
    requested source is not wired yet.
    """
    if source != "HBS":
        # MIT/Stanford have real emails and a direct first-touch; not wired in v1.
        log.warning("pull_directory: source=%s is not wired in v1 (HBS only). Skipping.", source)
        return []

    path = config.DIRECTORY_PULL_FILE
    if not os.path.exists(path):
        log.info(
            "No directory handoff file at %s — skipping the pull this run. "
            "To pull: open the HBS alumni directory in Chrome (logged in) and run the "
            "Claude-in-Chrome directory read (see chrome_interface.directory_pull_instructions), "
            "which writes the handoff file.",
            path,
        )
        return []

    try:
        with open(path) as f:
            raw = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        log.error("Could not read directory handoff file %s: %s. Skipping pull.", path, e)
        return []

    profiles: list[dict] = []
    for item in raw if isinstance(raw, list) else []:
        name = (item.get("name") or item.get("contact_name") or "").strip()
        company = (item.get("company") or "").strip()
        if not name or not company:
            log.warning("Skipping directory row missing name/company: %r", item)
            continue
        profiles.append(
            {
                "name": name,
                "company": company,
                "role": (item.get("role") or "").strip() or None,
                "location": (item.get("location") or "").strip() or None,
                "source": "HBS",
            }
        )
    log.info("pull_directory(HBS): %d profiles read from %s.", len(profiles), path)
    return profiles
