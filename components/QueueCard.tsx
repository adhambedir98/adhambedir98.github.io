"use client";

import { useState } from "react";
import { statusColor, statusLabel } from "@/lib/statuses";
import type { Contact, Outreach } from "@/lib/pipeline";

export default function QueueCard({
  o, c, onSave, onMarkSent, busy,
}: {
  o: Outreach;
  c: Contact;
  onSave: (id: string, subject: string, body: string) => Promise<void>;
  onMarkSent: (o: Outreach) => void;
  busy: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [subject, setSubject] = useState(o.subject || "");
  const [body, setBody] = useState(o.body || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave(o.id, subject, body);
    setSaving(false);
    setEdit(false);
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>{c.contact_name}</h3>
          <div className="meta">{c.role || "—"} · {c.company} · {c.location || "—"}</div>
        </div>
        <div className="badges">
          <span className="badge">{c.industry}</span>
          {c.owner && <span className="badge">{c.owner}</span>}
          <span className="badge" style={{ color: statusColor(c.status), borderColor: statusColor(c.status) }}>
            {statusLabel(c.status)}
          </span>
        </div>
      </div>

      {edit ? (
        <>
          <div className="field-label">Subject</div>
          <input className="editline" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <div className="field-label">Message</div>
          <textarea className="editbody" rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
        </>
      ) : (
        <>
          <div className="field-label">Subject</div>
          <div className="subject">{subject}</div>
          <div className="field-label">Message — send this yourself in the HBS directory</div>
          <div className="body">{body}</div>
        </>
      )}

      {c.notes && (
        <>
          <div className="field-label">Internal notes (never sent)</div>
          <div className="notes">{c.notes}</div>
        </>
      )}

      <div className="card-actions">
        {edit ? (
          <>
            <button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            <button className="ghost" onClick={() => { setSubject(o.subject || ""); setBody(o.body || ""); setEdit(false); }}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="ghost" onClick={() => setEdit(true)}>Edit</button>
            <button className="ghost" onClick={() => navigator.clipboard?.writeText(`${subject}\n\n${body}`)}>Copy</button>
            <button onClick={() => onMarkSent(o)} disabled={busy}>Mark sent</button>
          </>
        )}
      </div>
    </div>
  );
}
