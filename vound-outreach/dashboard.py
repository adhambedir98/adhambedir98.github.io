"""
Step 6 — daily review dashboard (Vound brand).

Generates a self-contained HTML file listing every queued first-touch so Adham can
review before sending each one himself in the HBS "message a fellow alum" composer.
Nothing here sends. Internal notes are shown for context in a clearly separate
block and are never part of the message body.

Brand (PART 5): black background, white text, serif headings (Georgia), sans body,
colors as CSS variables, minimal and high-contrast, status signalled with weight /
gray rather than new colors.
"""

from __future__ import annotations

import datetime as dt
import html
import os

CSS = """
:root { --color-primary:#000000; --color-secondary:#ffffff; --gray:#9a9a9a; --line:#2a2a2a; }
* { box-sizing:border-box; }
body { background:var(--color-primary); color:var(--color-secondary);
       font-family:Helvetica, Arial, system-ui, sans-serif; margin:0; padding:48px 56px; line-height:1.5; }
h1,h2,h3 { font-family:Georgia,'Times New Roman',serif; font-weight:normal; letter-spacing:0.2px; }
h1 { font-size:36px; margin:0 0 6px; }
.sub { color:var(--gray); margin:0 0 32px; font-size:14px; max-width:760px; }
.metrics { border-top:1px solid var(--line); border-bottom:1px solid var(--line);
           padding:22px 0; margin:0 0 40px; }
.metrics pre { font-family:Helvetica,Arial,sans-serif; white-space:pre-wrap; margin:0; font-size:13px; }
.card { border:1px solid var(--line); padding:26px 28px; margin:0 0 22px; }
.card-head { display:flex; justify-content:space-between; align-items:baseline; gap:18px;
             border-bottom:1px solid var(--line); padding-bottom:14px; margin-bottom:18px; }
.who h3 { margin:0 0 3px; font-size:21px; }
.who .meta { color:var(--gray); font-size:13px; }
.badges { text-align:right; white-space:nowrap; }
.badge { display:inline-block; border:1px solid var(--line); padding:3px 9px; margin-left:6px;
         text-transform:uppercase; letter-spacing:0.6px; font-size:11px; color:var(--gray); }
.badge.variant { color:var(--color-secondary); font-weight:bold; border-color:var(--color-secondary); }
.field-label { color:var(--gray); font-size:11px; text-transform:uppercase; letter-spacing:1px; margin:16px 0 5px; }
.subject { font-size:15px; font-weight:bold; }
.body { white-space:pre-wrap; font-size:14px; }
.personal { border-left:2px solid var(--gray); padding-left:12px; }
.notes { color:var(--gray); font-size:13px; font-style:italic; }
.sendnote { color:var(--gray); font-size:12px; margin-top:18px; border-top:1px dashed var(--line); padding-top:12px; }
code { color:var(--color-secondary); background:#141414; padding:1px 5px; }
"""


def _esc(s) -> str:
    return html.escape("" if s is None else str(s))


def render_dashboard(queued_rows, metrics_text, run_date=None, out_dir="review") -> str:
    run_date = run_date or dt.date.today().isoformat()
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"queue_{run_date}.html")

    cards = []
    for r in queued_rows:
        c = r.get("contact", {}) or {}
        personal = r.get("personalization")
        personal_block = (
            f'<div class="field-label">Suggested personalization (review / refine)</div>'
            f'<div class="personal">{_esc(personal)}</div>'
            if personal
            else ""
        )
        cards.append(
            f"""
        <div class="card">
          <div class="card-head">
            <div class="who">
              <h3>{_esc(c.get('contact_name'))}</h3>
              <div class="meta">{_esc(c.get('role')) or '&mdash;'} &middot; {_esc(c.get('company'))} &middot; {_esc(c.get('location')) or '&mdash;'}</div>
            </div>
            <div class="badges">
              <span class="badge">{_esc(c.get('industry'))}</span>
              <span class="badge variant">Variant {_esc(r.get('variant_label'))}</span>
              <span class="badge">{_esc(r.get('status', 'queued'))}</span>
            </div>
          </div>
          <div class="field-label">Subject</div>
          <div class="subject">{_esc(r.get('subject'))}</div>
          <div class="field-label">Message &mdash; first-touch, sent by you in the HBS directory</div>
          <div class="body">{_esc(r.get('body'))}</div>
          {personal_block}
          <div class="field-label">Internal notes (context only &mdash; never sent)</div>
          <div class="notes">{_esc(c.get('notes')) or '&mdash;'}</div>
          <div class="sendnote">Send this yourself in the HBS composer, then run
            <code>python run_daily.py mark-sent --ids {_esc(r.get('id'))}</code></div>
        </div>"""
        )

    if not queued_rows:
        cards.append('<div class="card"><div class="notes">No first-touch messages queued today.</div></div>')

    doc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vound outreach &mdash; review {run_date}</title>
<style>{CSS}</style></head>
<body>
  <h1>Vound outreach</h1>
  <p class="sub">Daily review &mdash; {run_date}. {len(queued_rows)} first-touch message(s) queued.
  Nothing is sent automatically. Review each, then send it yourself in the HBS alumni directory.
  Follow-ups (after someone replies) go out from Gmail only when you approve them.</p>
  <div class="metrics"><div class="field-label">Metrics</div><pre>{_esc(metrics_text)}</pre></div>
  {''.join(cards)}
</body></html>"""

    with open(path, "w") as f:
        f.write(doc)
    return path
