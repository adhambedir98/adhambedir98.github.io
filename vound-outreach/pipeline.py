"""
Steps 2-8 of the daily flow, as composable functions. ``run_daily.py`` wires them
in order and logs each. Nothing here sends anything: Step 6 only queues, and the
only function that sends mail lives in ``gmail_client.send_approved()`` behind an
explicit-approval gate.
"""

from __future__ import annotations

import datetime as dt
import logging
from collections import defaultdict

from personalize import personalize_line
from textutil import first_name, truncate

log = logging.getLogger(__name__)

# Outreach statuses that mean "this left the queue / was actually sent".
SENT_STATES = {"sent", "replied", "bounced", "no_response"}


# ───────────────────────── helpers ──────────────────────────────────────────
def dedupe_key(name: str, company: str) -> str:
    """Mirror of the DB's generated dedupe_key, for the in-code pre-check."""
    return f"{(name or '').strip().lower()}|{(company or '').strip().lower()}"


def _tier_rank(tier: str | None) -> int:
    """Tier 1 < Tier 2 < Tier 3; anything else sorts last."""
    if tier:
        for ch in tier:
            if ch.isdigit():
                return int(ch)
    return 99


def _render(template: str, contact: dict) -> str:
    """Replace merge tokens. Uses str.replace (not .format) so stray braces in copy
    never raise."""
    fn = first_name(contact.get("contact_name"))
    out = template
    for token, value in (
        ("{first_name}", fn),
        ("{company}", contact.get("company") or ""),
        ("{role}", contact.get("role") or ""),
        ("{location}", contact.get("location") or ""),
    ):
        out = out.replace(token, value)
    return out


def _now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


# ───────────────────────── Step 2: dedupe + insert ──────────────────────────
def dedupe_and_insert(client, profiles: list[dict], new_status: str = "to_contact") -> dict:
    """Insert only genuinely-new people. Checked in code AND enforced by the DB
    unique constraint on dedupe_key (the 'don't double-add' guarantee)."""
    if not profiles:
        log.info("Step 2: no profiles to insert.")
        return {"inserted": 0, "skipped": 0, "errors": 0}

    existing = {
        r["dedupe_key"]
        for r in (client.table("contacts").select("dedupe_key").execute().data or [])
    }
    inserted = skipped = errors = 0
    for p in profiles:
        key = dedupe_key(p["name"], p["company"])
        if key in existing:
            skipped += 1
            continue
        try:
            client.table("contacts").insert(
                {
                    "company": p["company"],
                    "contact_name": p["name"],
                    "role": p.get("role"),
                    "location": p.get("location"),
                    "source": p.get("source", "HBS"),
                    "source_raw": p.get("source_raw") or f"{p.get('source', 'HBS')} alumni directory",
                    "status": new_status,
                }
            ).execute()
            existing.add(key)
            inserted += 1
        except Exception as e:  # DB unique constraint is the backstop
            if "contacts_dedupe_unique" in str(e) or "23505" in str(e):
                skipped += 1
            else:
                log.error("Insert failed for %s / %s: %s", p["name"], p["company"], e)
                errors += 1
    log.info("Step 2: inserted=%d skipped=%d errors=%d", inserted, skipped, errors)
    return {"inserted": inserted, "skipped": skipped, "errors": errors}


# ───────────────────────── Step 3: pick today's targets ─────────────────────
def pick_targets(client, n: int, source: str = "HBS") -> list[dict]:
    """Up to n contacts: source=source, status=to_contact, with NO existing
    first-touch (so daily reruns never double-queue). Priority: Warm before Cold,
    then Tier 1<2<3, then oldest-added first. No email requirement (HBS first-touch
    needs none)."""
    contacts = (
        client.table("contacts")
        .select("*")
        .eq("source", source)
        .eq("status", "to_contact")
        .execute()
        .data
        or []
    )
    first_touched = (
        client.table("outreach").select("contact_id").eq("is_first_touch", True).execute().data or []
    )
    already = {r["contact_id"] for r in first_touched}
    pool = [c for c in contacts if c["id"] not in already]

    def sort_key(c):
        warm_rank = 0 if (c.get("warm_cold") or "").strip().lower() == "warm" else 1
        return (warm_rank, _tier_rank(c.get("tier")), c.get("created_at") or "")

    pool.sort(key=sort_key)
    chosen = pool[:n]
    log.info(
        "Step 3: %d eligible (%s, to_contact, no prior first-touch); picked %d.",
        len(pool), source, len(chosen),
    )
    return chosen


# ───────────────────────── Step 4: assign A/B variant ───────────────────────
def active_variants(client) -> list[dict]:
    return (
        client.table("message_variants").select("*").eq("active", True).order("label").execute().data
        or []
    )


def assign_variants(client, targets: list[dict]) -> list[tuple[dict, dict]]:
    """Round-robin across active variants, balanced by cumulative first-touch volume
    so each variant gets roughly equal share over time. With one active variant,
    everyone gets it. (A/B applies to first-touch only.)"""
    variants = active_variants(client)
    if not variants:
        raise RuntimeError("No active message_variants. Add at least one row with active=true.")

    counts: dict[str, int] = defaultdict(int)
    for r in client.table("outreach").select("variant_id").eq("is_first_touch", True).execute().data or []:
        if r.get("variant_id"):
            counts[r["variant_id"]] += 1

    assignments: list[tuple[dict, dict]] = []
    for c in targets:
        v = min(variants, key=lambda vv: (counts[vv["id"]], vv["label"]))
        counts[v["id"]] += 1
        assignments.append((c, v))

    by_label: dict[str, int] = defaultdict(int)
    for _, v in assignments:
        by_label[v["label"]] += 1
    log.info("Step 4: assigned variants %s", dict(by_label))
    return assignments


# ───────────────────────── Step 5: draft messages ───────────────────────────
def draft_messages(assignments: list[tuple[dict, dict]]) -> list[dict]:
    """Render each variant, then insert one personalization line after the greeting."""
    drafts = []
    for contact, variant in assignments:
        subject = _render(variant["subject"], contact)
        body = _render(variant["body"], contact)
        line = personalize_line(contact)
        if line:
            parts = body.split("\n\n")
            parts = ([parts[0], line] + parts[1:]) if parts else [line]
            body = "\n\n".join(parts)
        drafts.append(
            {
                "contact": contact,
                "contact_id": contact["id"],
                "variant_id": variant["id"],
                "variant_label": variant["label"],
                "subject": subject,
                "body": body,
                "personalization": line,
            }
        )
    log.info("Step 5: drafted %d personalized messages.", len(drafts))
    return drafts


# ───────────────────────── Step 6: queue (NEVER send) ───────────────────────
def queue_outreach(client, drafts: list[dict], sender_email: str) -> list[dict]:
    queued = []
    for d in drafts:
        rows = (
            client.table("outreach")
            .insert(
                {
                    "contact_id": d["contact_id"],
                    "sender": sender_email,
                    "channel": "hbs_directory",
                    "is_first_touch": True,
                    "variant_id": d["variant_id"],
                    "subject": d["subject"],
                    "body": d["body"],
                    "status": "queued",
                }
            )
            .execute()
            .data
            or [{}]
        )
        rec = dict(rows[0])
        rec["contact"] = d["contact"]
        rec["variant_label"] = d["variant_label"]
        rec["personalization"] = d["personalization"]
        queued.append(rec)
    log.info("Step 6: queued %d first-touch message(s) for review. NOTHING SENT.", len(queued))
    return queued


def mark_first_touch_sent(client, outreach_ids: list[str]) -> int:
    """Call after you've sent the first-touch(es) yourself in the HBS composer.
    Flips outreach -> sent and the contact -> contacted with last_contacted_at."""
    n = 0
    now = _now_iso()
    for oid in outreach_ids:
        rows = (
            client.table("outreach")
            .update({"status": "sent", "sent_at": now})
            .eq("id", oid)
            .eq("channel", "hbs_directory")
            .execute()
            .data
        )
        if rows:
            cid = rows[0]["contact_id"]
            client.table("contacts").update(
                {"status": "contacted", "last_contacted_at": now}
            ).eq("id", cid).execute()
            n += 1
        else:
            log.warning("mark-sent: no hbs_directory outreach found with id %s", oid)
    log.info("Marked %d first-touch outreach as sent; contacts -> contacted.", n)
    return n


# ───────────────────────── Step 7: reply tracking + backfill ────────────────
def _match_by_identity(messages: list[dict], contact: dict) -> dict | None:
    """HBS relayed replies carry the alum's name/company. Fuzzy match on those."""
    name = (contact.get("contact_name") or "").lower().replace(".", " ")
    company = (contact.get("company") or "").lower()
    tokens = [t for t in name.split() if len(t) > 1]
    first = tokens[0] if tokens else ""
    last = tokens[-1] if tokens else ""
    for m in messages:
        hay = " ".join(
            [m.get("from_name") or "", m.get("from_email") or "", m.get("subject") or "", m.get("body") or ""]
        ).lower()
        name_hit = bool(first and last) and first in hay and last in hay
        company_hit = bool(company) and company in hay
        if name_hit or company_hit:
            return m
    return None


def match_replies(client, gmail) -> dict:
    """For each sent outreach awaiting a reply, find a matching inbound message,
    record + classify it, and backfill the alum's real email on a real reply.

    ``gmail`` is the gmail_client module (or None to skip when not configured)."""
    if gmail is None:
        log.info("Step 7: Gmail not configured; skipping reply tracking and email backfill.")
        return {"matched": 0, "skipped": True}

    awaiting = client.table("outreach").select("*").eq("status", "sent").execute().data or []
    if not awaiting:
        log.info("Step 7: no sent outreach awaiting replies.")
        return {"matched": 0}

    contacts = {c["id"]: c for c in (client.table("contacts").select("*").execute().data or [])}
    messages = gmail.list_inbound(days=30)
    matched = 0
    for o in awaiting:
        c = contacts.get(o["contact_id"], {})
        if o["channel"] == "gmail" and o.get("gmail_thread_id"):
            msg = next((m for m in messages if m.get("thread_id") == o["gmail_thread_id"]), None)
        else:  # hbs_directory first-touch: no thread id, match by identity
            msg = _match_by_identity(messages, c)
        if not msg:
            continue

        classification = gmail.classify(msg)
        client.table("replies").insert(
            {
                "outreach_id": o["id"],
                "contact_id": o["contact_id"],
                "received_at": msg.get("date"),
                "snippet": truncate(msg.get("snippet") or msg.get("body"), 300),
                "classification": classification,
                "gmail_message_id": msg.get("message_id"),
            }
        ).execute()

        contact_updates: dict = {}
        # The reply is the moment we finally learn the alum's real email.
        if classification == "real_reply" and msg.get("from_email") and not c.get("email"):
            contact_updates["email"] = msg["from_email"]
        if classification == "bounce":
            client.table("outreach").update({"status": "bounced"}).eq("id", o["id"]).execute()
            contact_updates["status"] = "bounced"
        elif classification == "real_reply":
            client.table("outreach").update(
                {"status": "replied", "replied_at": msg.get("date")}
            ).eq("id", o["id"]).execute()
            contact_updates["status"] = "replied"
        # auto_reply / out_of_office: leave outreach as 'sent'; it's not a real reply.
        if contact_updates:
            client.table("contacts").update(contact_updates).eq("id", o["contact_id"]).execute()
        matched += 1

    log.info("Step 7: matched %d repl(y/ies).", matched)
    return {"matched": matched}


# ───────────────────────── Step 8: metrics ──────────────────────────────────
def compute_metrics(client) -> dict:
    """Reply rate (real replies / sent) per variant and per industry."""
    variants = {v["id"]: v["label"] for v in (client.table("message_variants").select("id,label").execute().data or [])}
    outreach = client.table("outreach").select("id,variant_id,status,is_first_touch,contact_id").execute().data or []
    replies = client.table("replies").select("outreach_id,classification").execute().data or []
    real_outreach = {r["outreach_id"] for r in replies if r.get("classification") == "real_reply"}
    contacts = {c["id"]: c for c in (client.table("contacts").select("id,industry").execute().data or [])}

    per_variant = defaultdict(lambda: {"sent": 0, "real_replies": 0})
    per_industry = defaultdict(lambda: {"sent": 0, "real_replies": 0})
    for o in outreach:
        if not o.get("is_first_touch") or o["status"] not in SENT_STATES:
            continue  # only count first-touch that actually left the queue
        label = variants.get(o.get("variant_id"), "?")
        industry = (contacts.get(o["contact_id"], {}) or {}).get("industry", "unknown")
        per_variant[label]["sent"] += 1
        per_industry[industry]["sent"] += 1
        if o["id"] in real_outreach:
            per_variant[label]["real_replies"] += 1
            per_industry[industry]["real_replies"] += 1
    return {"per_variant": dict(per_variant), "per_industry": dict(per_industry)}


def format_metrics(metrics: dict) -> str:
    pv = metrics["per_variant"]
    pi = metrics["per_industry"]
    lines = ["Reply rate per variant (real replies / sent):"]
    if not pv:
        lines.append("  (no first-touch sent yet — queue some and mark them sent)")
    total_sent = total_real = 0
    for label in sorted(pv):
        s, r = pv[label]["sent"], pv[label]["real_replies"]
        total_sent += s
        total_real += r
        rate = (r / s * 100) if s else 0.0
        lines.append(f"  {label}: {r}/{s} = {rate:.1f}%")
    if pv:
        small = total_sent < 60 or any(v["sent"] < 30 for v in pv.values()) or total_real < 10
        if small:
            lines.append(
                "  Caveat: sample still small, do not call it yet. Aim for ~30+ sent per "
                "variant and 10+ real replies before trusting any gap."
            )
        else:
            lines.append("  Sample is becoming meaningful; watch the gap but confirm it holds.")

    lines.append("")
    lines.append("Reply rate by industry (real replies / sent):")
    if not pi:
        lines.append("  (none yet)")
    for ind in sorted(pi, key=lambda k: -pi[k]["sent"]):
        s, r = pi[ind]["sent"], pi[ind]["real_replies"]
        rate = (r / s * 100) if s else 0.0
        lines.append(f"  {ind}: {r}/{s} = {rate:.1f}%")
    return "\n".join(lines)
