"""
Supabase client factory.

The agent authenticates with the SERVICE-ROLE key, which bypasses Row Level
Security. RLS is enabled on every table with no public policies, so the data is
private by default and only this server-side agent can read or write it. Never
ship the service-role key to a browser or any client-side code.
"""

from __future__ import annotations

from supabase import Client, create_client

import config

_client: Client | None = None


def get_client() -> Client:
    """Return a cached Supabase client, creating it on first use."""
    global _client
    if _client is None:
        if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env. "
                "Find the service-role key in Supabase > Project Settings > API."
            )
        _client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)
    return _client
