"""
Central configuration for the Vound outreach agent.

Every secret comes from an environment variable (loaded from .env, which is
gitignored). Nothing sensitive is hardcoded. See .env.example for the full list.

Multi-founder seam
------------------
Today the agent runs as a single sender (Adham). The SENDERS dict and
get_active_sender() are structured so Aly and Youssef can be added later as
separate identities — each with their own Gmail token — without touching the
pipeline. To add one: append an entry to SENDERS and set ACTIVE_SENDER.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _env(key: str, default: str | None = None, required: bool = False) -> str | None:
    val = os.getenv(key, default)
    if required and not val:
        raise RuntimeError(f"Missing required environment variable: {key}")
    return val


# ── Supabase ─────────────────────────────────────────────────────────────────
SUPABASE_URL = _env("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = _env("SUPABASE_SERVICE_ROLE_KEY")

# ── Targeting / volume ───────────────────────────────────────────────────────
DAILY_SEND_CAP = int(_env("DAILY_SEND_CAP", "20"))
TARGET_SOURCE = _env("TARGET_SOURCE", "HBS")          # v1 = HBS only

# ── Files ────────────────────────────────────────────────────────────────────
SEED_FILE = _env("SEED_FILE", "data/vound_contacts_seed.json")
DIRECTORY_PULL_FILE = _env("DIRECTORY_PULL_FILE", "inbox/hbs_directory_pull.json")
REVIEW_DIR = _env("REVIEW_DIR", "review")


@dataclass(frozen=True)
class SenderIdentity:
    """One founder's sending identity. Gmail is used for follow-ups only."""
    name: str
    email: str
    gmail_credentials_file: str   # OAuth client secret (Desktop app) JSON
    gmail_token_file: str         # cached OAuth token for this sender


# One sender for now. Add Aly / Youssef here later, each with its own token file.
SENDERS: dict[str, SenderIdentity] = {
    "Adham": SenderIdentity(
        name="Adham",
        email=_env("OUTREACH_SENDER", "adham@vound.ai"),
        gmail_credentials_file=_env("GMAIL_CREDENTIALS_FILE", "credentials/gmail_client_secret.json"),
        gmail_token_file=_env("GMAIL_TOKEN_FILE", "credentials/adham_token.json"),
    ),
}
ACTIVE_SENDER = _env("ACTIVE_SENDER", "Adham")


def get_active_sender() -> SenderIdentity:
    if ACTIVE_SENDER not in SENDERS:
        raise RuntimeError(
            f"ACTIVE_SENDER={ACTIVE_SENDER!r} is not defined in SENDERS "
            f"(known: {', '.join(SENDERS)})."
        )
    return SENDERS[ACTIVE_SENDER]
