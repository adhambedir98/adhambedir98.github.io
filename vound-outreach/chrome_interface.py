"""
Claude-in-Chrome seam.

Two interactive jobs are fulfilled by Claude operating Adham's already-logged-in
Chrome — never by headless automation and never with stored credentials:

  1. Directory pull (Step 1): Claude reads the authenticated HBS alumni directory
     page Adham already has open and writes the visible profiles to the handoff
     file (``config.DIRECTORY_PULL_FILE``) as a JSON list of
     ``{name, company, role, location}``. ``directory.pull_directory()`` reads it.

  2. First-touch compose assist (Step 6, channel='hbs_directory'): for each queued
     first-touch, Claude can open the alum's profile, click "message a fellow
     alum", and FILL the subject and body for Adham to review and click send
     himself. It never clicks send.

This module is intentionally thin: it builds the instructions and payloads to hand
to Claude in Chrome, and provides ``write_pull_file`` for Claude to deposit pull
results. Nothing here scrapes, stores credentials, or sends anything.
"""

from __future__ import annotations

import json
import logging
import os

import config

log = logging.getLogger(__name__)


def chrome_available() -> bool:
    """True when running inside a Claude-in-Chrome session.

    Set ``CLAUDE_IN_CHROME=1`` in that environment. Defaults to False, in which
    case Step 1 no-ops and first-touch is composed manually.
    """
    return os.getenv("CLAUDE_IN_CHROME", "").strip().lower() in ("1", "true", "yes")


def directory_pull_instructions(source: str = "HBS") -> str:
    """Checklist to hand Claude in Chrome for the directory read."""
    return (
        f"You are reading the {source} alumni directory in a browser where Adham is "
        "already logged in. Do NOT log in, store credentials, or bulk-scrape beyond what "
        "is visible on the pages Adham navigates. For each alum profile visible on the "
        "current results page capture: name, company, role/title, location. Then call "
        f"chrome_interface.write_pull_file(profiles) to save them to "
        f"{config.DIRECTORY_PULL_FILE} as a JSON list. The pipeline reads that file in Step 1."
    )


def write_pull_file(profiles: list[dict], path: str | None = None) -> str:
    """Deposit directory-read results to the handoff file (called by Claude in Chrome)."""
    path = path or config.DIRECTORY_PULL_FILE
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as f:
        json.dump(profiles, f, indent=2)
    log.info("Wrote %d profiles to handoff file %s", len(profiles), path)
    return path


def compose_payloads(queued_rows: list[dict]) -> list[dict]:
    """Per-first-touch payloads for Claude in Chrome to fill into the HBS
    'message a fellow alum' composer. Returns subject/body plus how to locate the
    alum. Does NOT send — Adham reviews and clicks send."""
    payloads = []
    for row in queued_rows:
        c = row.get("contact", {}) or {}
        payloads.append(
            {
                "outreach_id": row.get("id"),
                "find_alum_by": {"name": c.get("contact_name"), "company": c.get("company")},
                "subject": row.get("subject"),
                "body": row.get("body"),
                "instruction": (
                    "Open this alum in the HBS directory, click 'message a fellow alum', "
                    "paste the subject and body, then STOP. Adham reviews and clicks send. "
                    "After he sends, mark it: python run_daily.py mark-sent --ids "
                    f"{row.get('id')}"
                ),
            }
        )
    return payloads
