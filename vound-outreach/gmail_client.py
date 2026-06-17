"""
Gmail API integration (low-volume, two jobs):

  - Step 7: read the adham@vound.ai inbox to find replies (and HBS bcc copies),
    classify them, and let the pipeline backfill the alum's real email on reply.
  - Step 6 (channel='gmail'): send FOLLOW-UPS to people who already replied, and
    only for the outreach ids passed explicitly to ``send_approved()``. Cold
    first-touch is never sent here — HBS relays that from its own reputation.

Auth is OAuth (Desktop-app client). The token is created once via ``authorize()``
and cached per sender (``config.SenderIdentity.gmail_token_file``). On a headless
Mac Mini, run ``python run_daily.py gmail-auth`` once interactively; cron runs then
reuse the cached token. Google libraries are imported lazily so the rest of the
pipeline runs even if they are not installed yet.
"""

from __future__ import annotations

import base64
import datetime as dt
import logging
import os
from email.mime.text import MIMEText
from email.utils import parseaddr, parsedate_to_datetime

import config

log = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]


def available(sender=None) -> bool:
    """True if we have either a cached token or client secret to authorize with."""
    sender = sender or config.get_active_sender()
    return os.path.exists(sender.gmail_token_file) or os.path.exists(sender.gmail_credentials_file)


def _service(sender=None):
    """Build an authenticated Gmail service, refreshing/creating the token as needed."""
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

    sender = sender or config.get_active_sender()
    creds = None
    if os.path.exists(sender.gmail_token_file):
        creds = Credentials.from_authorized_user_file(sender.gmail_token_file, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(sender.gmail_credentials_file, SCOPES)
            creds = flow.run_local_server(port=0)
        os.makedirs(os.path.dirname(sender.gmail_token_file) or ".", exist_ok=True)
        with open(sender.gmail_token_file, "w") as f:
            f.write(creds.to_json())
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def authorize(sender=None) -> None:
    """Run once interactively to create the cached token (opens a browser)."""
    _service(sender)
    log.info("Gmail authorized; token cached for %s.", (sender or config.get_active_sender()).email)


# ───────────────────────── reading (Step 7) ─────────────────────────────────
def _decode_body(payload) -> str:
    def walk(p):
        if p.get("mimeType") == "text/plain" and p.get("body", {}).get("data"):
            return base64.urlsafe_b64decode(p["body"]["data"]).decode("utf-8", "replace")
        for part in p.get("parts", []) or []:
            t = walk(part)
            if t:
                return t
        return ""

    return walk(payload or {})


def list_inbound(days: int = 30, sender=None) -> list[dict]:
    """Recent inbox messages as normalized dicts."""
    svc = _service(sender)
    after = (dt.date.today() - dt.timedelta(days=days)).strftime("%Y/%m/%d")
    resp = svc.users().messages().list(userId="me", q=f"in:inbox after:{after}", maxResults=200).execute()
    out = []
    for ref in resp.get("messages", []):
        full = svc.users().messages().get(userId="me", id=ref["id"], format="full").execute()
        headers = {h["name"].lower(): h["value"] for h in full.get("payload", {}).get("headers", [])}
        from_name, from_email = parseaddr(headers.get("from", ""))
        try:
            date = parsedate_to_datetime(headers.get("date", "")).isoformat()
        except Exception:
            date = None
        out.append(
            {
                "message_id": full.get("id"),
                "thread_id": full.get("threadId"),
                "from_name": from_name,
                "from_email": (from_email or "").lower(),
                "subject": headers.get("subject", ""),
                "snippet": full.get("snippet", ""),
                "body": _decode_body(full.get("payload", {})),
                "date": date,
            }
        )
    log.info("Gmail: fetched %d inbound message(s) from the last %d days.", len(out), days)
    return out


# ───────────────────────── classification (Step 7) ──────────────────────────
_OOO_MARKERS = (
    "out of office", "out of the office", "automatic reply", "auto-reply", "autoreply",
    "on leave", "annual leave", "on vacation", "currently away", "away from my desk",
    "maternity leave", "paternity leave",
)
_BOUNCE_SENDERS = ("mailer-daemon", "postmaster")


def classify(msg: dict) -> str:
    """bounce | out_of_office | auto_reply | real_reply, via simple heuristics."""
    frm = (msg.get("from_email") or "").lower()
    subj = (msg.get("subject") or "").lower()
    body = (msg.get("body") or "").lower()
    if any(b in frm for b in _BOUNCE_SENDERS) or "delivery status notification" in subj or "undeliverable" in subj:
        return "bounce"
    if any(m in subj for m in _OOO_MARKERS) or any(m in body[:400] for m in _OOO_MARKERS):
        return "out_of_office"
    if "do-not-reply" in frm or "noreply" in frm or "no-reply" in frm:
        return "auto_reply"
    return "real_reply"


# ───────────────────────── sending follow-ups (Step 6, gmail) ───────────────
def _send_raw(svc, to, subject, body, sender_email, thread_id=None):
    mime = MIMEText(body)
    mime["to"] = to
    mime["from"] = sender_email
    mime["subject"] = subject
    payload = {"raw": base64.urlsafe_b64encode(mime.as_bytes()).decode()}
    if thread_id:
        payload["threadId"] = thread_id
    return svc.users().messages().send(userId="me", body=payload).execute()


def send_approved(client, outreach_ids: list[str], sender=None) -> dict:
    """Send ONLY the gmail-channel follow-ups whose ids are passed in.

    Each id must be a queued, non-first-touch, gmail-channel outreach row for a
    contact that already has a real email (i.e. they replied). This is the only
    function that sends mail, and it sends nothing unless you explicitly list ids.
    """
    sender = sender or config.get_active_sender()
    if not outreach_ids:
        log.info("send_approved: no ids passed; nothing to send.")
        return {"sent": 0}

    svc = _service(sender)
    sent = 0
    for oid in outreach_ids:
        rows = client.table("outreach").select("*").eq("id", oid).execute().data or []
        if not rows:
            log.warning("send_approved: outreach %s not found.", oid)
            continue
        o = rows[0]
        if o["channel"] != "gmail" or o["is_first_touch"] or o["status"] != "queued":
            log.warning("send_approved: %s is not a queued gmail follow-up; refusing.", oid)
            continue
        c = (client.table("contacts").select("*").eq("id", o["contact_id"]).execute().data or [{}])[0]
        if not c.get("email"):
            log.warning("send_approved: contact for %s has no email yet; refusing.", oid)
            continue
        resp = _send_raw(svc, c["email"], o["subject"], o["body"], sender.email, o.get("gmail_thread_id"))
        client.table("outreach").update(
            {
                "status": "sent",
                "sent_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "gmail_message_id": resp.get("id"),
                "gmail_thread_id": resp.get("threadId"),
            }
        ).eq("id", oid).execute()
        sent += 1
    log.info("send_approved: sent %d follow-up(s).", sent)
    return {"sent": sent}
