"""
Vound daily outreach agent — entry point.

Default run (queue only, NOTHING IS SENT):
    python run_daily.py
    python run_daily.py daily

After you have sent a first-touch yourself in the HBS directory:
    python run_daily.py mark-sent --ids <outreach_id> [<outreach_id> ...]

Send Gmail FOLLOW-UPS (only to people who already replied; explicit approval):
    python run_daily.py send-approved --ids <outreach_id> [<outreach_id> ...]

One-time Gmail OAuth authorization (opens a browser, caches a token):
    python run_daily.py gmail-auth

Print the HBS compose payloads for Claude in Chrome (does not send):
    python run_daily.py compose

v1 targets HBS contacts only. First-touch goes through the HBS directory (you send
it); follow-ups go through Gmail (only after a reply, only when you approve them).
"""

from __future__ import annotations

import argparse
import datetime as dt
import logging

import chrome_interface
import config
import dashboard
import directory
import pipeline
from db import get_client

try:  # google libs are optional until Gmail is wired
    import gmail_client
except Exception:  # pragma: no cover
    gmail_client = None

log = logging.getLogger("run_daily")


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-5s  %(name)-16s  %(message)s",
        datefmt="%H:%M:%S",
    )


def _gmail_or_none():
    if gmail_client and gmail_client.available():
        return gmail_client
    return None


def run_daily() -> None:
    client = get_client()
    sender = config.get_active_sender()
    today = dt.date.today().isoformat()
    log.info(
        "=== Vound daily outreach | %s | sender=%s | source=%s | cap=%d ===",
        today, sender.email, config.TARGET_SOURCE, config.DAILY_SEND_CAP,
    )

    # Step 1 — directory pull (Claude in Chrome; graceful no-op if absent)
    log.info("[Step 1] HBS directory pull")
    profiles = directory.pull_directory(config.TARGET_SOURCE)

    # Step 2 — dedupe + insert, then log the directory run
    log.info("[Step 2] dedupe + insert")
    ins = pipeline.dedupe_and_insert(client, profiles)
    client.table("directory_runs").insert(
        {
            "run_date": today,
            "source": config.TARGET_SOURCE,
            "profiles_seen": len(profiles),
            "new_contacts_added": ins["inserted"],
            "notes": (f"skipped={ins['skipped']} errors={ins['errors']}"
                      + ("" if profiles else " (no pull this run)")),
        }
    ).execute()

    # Step 3 — pick today's targets
    log.info("[Step 3] pick targets")
    targets = pipeline.pick_targets(client, config.DAILY_SEND_CAP, config.TARGET_SOURCE)

    # Step 4 — assign A/B variant
    log.info("[Step 4] assign A/B variant")
    assignments = pipeline.assign_variants(client, targets)

    # Step 5 — draft personalized messages
    log.info("[Step 5] draft personalized messages")
    drafts = pipeline.draft_messages(assignments)

    # Step 6 — queue for review (DO NOT SEND)
    log.info("[Step 6] queue for review")
    queued = pipeline.queue_outreach(client, drafts, sender.email)

    # Step 7 — reply tracking + email backfill
    log.info("[Step 7] reply tracking + email backfill")
    pipeline.match_replies(client, _gmail_or_none())

    # Step 8 — metrics
    log.info("[Step 8] metrics")
    metrics = pipeline.compute_metrics(client)
    metrics_text = pipeline.format_metrics(metrics)
    print("\n" + metrics_text + "\n")

    path = dashboard.render_dashboard(queued, metrics_text, today, config.REVIEW_DIR)
    log.info("Review dashboard: %s", path)
    print(f"Review {len(queued)} queued first-touch message(s): open {path}")
    print("NOTHING WAS SENT. Send each first-touch yourself in the HBS directory, then:")
    print("  python run_daily.py mark-sent --ids <outreach_id> ...")


def cmd_mark_sent(ids: list[str]) -> None:
    pipeline.mark_first_touch_sent(get_client(), ids)


def cmd_send_approved(ids: list[str]) -> None:
    if not gmail_client:
        raise SystemExit("Gmail libraries not installed (pip install -r requirements.txt).")
    gmail_client.send_approved(get_client(), ids)


def cmd_gmail_auth() -> None:
    if not gmail_client:
        raise SystemExit("Gmail libraries not installed (pip install -r requirements.txt).")
    gmail_client.authorize()


def cmd_compose() -> None:
    """Print the per-first-touch compose payloads for Claude in Chrome (no send)."""
    import json

    client = get_client()
    queued = client.table("outreach").select("*").eq("channel", "hbs_directory").eq("status", "queued").execute().data or []
    contacts = {c["id"]: c for c in (client.table("contacts").select("*").execute().data or [])}
    for row in queued:
        row["contact"] = contacts.get(row["contact_id"], {})
    print(json.dumps(chrome_interface.compose_payloads(queued), indent=2))


def main() -> None:
    setup_logging()
    parser = argparse.ArgumentParser(description="Vound daily outreach agent (HBS v1).")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("daily", help="run steps 1-8 (queue only; default)")
    p_mark = sub.add_parser("mark-sent", help="mark first-touch(es) sent after you sent them in HBS")
    p_mark.add_argument("--ids", nargs="+", required=True)
    p_send = sub.add_parser("send-approved", help="send Gmail follow-ups for the given outreach ids")
    p_send.add_argument("--ids", nargs="+", required=True)
    sub.add_parser("gmail-auth", help="one-time Gmail OAuth authorization")
    sub.add_parser("compose", help="print HBS compose payloads for Claude in Chrome")

    args = parser.parse_args()
    if args.command in (None, "daily"):
        run_daily()
    elif args.command == "mark-sent":
        cmd_mark_sent(args.ids)
    elif args.command == "send-approved":
        cmd_send_approved(args.ids)
    elif args.command == "gmail-auth":
        cmd_gmail_auth()
    elif args.command == "compose":
        cmd_compose()


if __name__ == "__main__":
    main()
