"use client";

import { useCallback, useEffect, useState } from "react";
import type { OutreachEntry } from "@/lib/types";

const LS_KEY = "davos2027_outreach_identity";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AFFILIATION_SUGGESTIONS = [
  "HBS alum",
  "HKS alum",
  "Harvard College alum",
  "HLS alum",
  "Current HBS",
  "None / external",
];

interface Identity {
  name: string;
  email: string;
}

interface FormState {
  company: string;
  contact_name: string;
  contact_title: string;
  harvard_affiliation: string;
  outreach_date: string;
  notes: string;
}

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function emptyForm(): FormState {
  return {
    company: "",
    contact_name: "",
    contact_title: "",
    harvard_affiliation: "",
    outreach_date: todayISO(),
    notes: "",
  };
}

export function SponsorshipTracker() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityLoaded, setIdentityLoaded] = useState(false);

  // Identity gate fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [entries, setEntries] = useState<OutreachEntry[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [website, setWebsite] = useState(""); // honeypot

  // Restore identity from this phone/browser.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Identity;
        if (parsed?.name && parsed?.email) setIdentity(parsed);
      }
    } catch {
      // ignore corrupt storage
    }
    setIdentityLoaded(true);
  }, []);

  const fetchEntries = useCallback(async (who: Identity) => {
    setListLoading(true);
    try {
      const res = await fetch(
        `/api/outreach?email=${encodeURIComponent(who.email)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEntries((data.entries ?? []) as OutreachEntry[]);
    } catch {
      setError("Couldn't load your entries. Pull to refresh or try again.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (identity) fetchEntries(identity);
  }, [identity, fetchEntries]);

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 2500);
  }

  function saveIdentity(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = name.trim();
    const em = email.trim().toLowerCase();
    if (!n) return setError("Please enter your name.");
    if (!EMAIL_RE.test(em)) return setError("Please enter a valid email.");
    const who = { name: n, email: em };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(who));
    } catch {
      // storage may be unavailable (private mode) — session still works
    }
    setIdentity(who);
  }

  function switchPerson() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
    setIdentity(null);
    setEntries([]);
    setEditingId(null);
    setForm(emptyForm());
    setName("");
    setEmail("");
  }

  function startEdit(entry: OutreachEntry) {
    setEditingId(entry.id);
    setForm({
      company: entry.company,
      contact_name: entry.contact_name,
      contact_title: entry.contact_title ?? "",
      harvard_affiliation: entry.harvard_affiliation ?? "",
      outreach_date: entry.outreach_date ?? "",
      notes: entry.notes ?? "",
    });
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!identity) return;
    setError(null);

    if (!form.company.trim()) return setError("Please enter the company.");
    if (!form.contact_name.trim())
      return setError("Please enter the person's name.");

    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/outreach/${editingId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            submitter_email: identity.email,
            company: form.company.trim(),
            contact_name: form.contact_name.trim(),
            contact_title: form.contact_title,
            harvard_affiliation: form.harvard_affiliation,
            outreach_date: form.outreach_date,
            notes: form.notes,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't save changes.");
        setEntries((curr) =>
          curr.map((x) => (x.id === editingId ? (data.entry as OutreachEntry) : x))
        );
        setEditingId(null);
        setForm(emptyForm());
        flash("Changes saved.");
      } else {
        const res = await fetch("/api/outreach", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            submitter_name: identity.name,
            submitter_email: identity.email,
            company: form.company.trim(),
            contact_name: form.contact_name.trim(),
            contact_title: form.contact_title,
            harvard_affiliation: form.harvard_affiliation,
            outreach_date: form.outreach_date,
            notes: form.notes,
            website, // honeypot
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't save the entry.");
        if (data.entry) {
          setEntries((curr) => [data.entry as OutreachEntry, ...curr]);
        }
        setForm(emptyForm());
        flash("Outreach logged.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(entry: OutreachEntry) {
    if (!identity) return;
    if (
      !window.confirm(
        `Remove ${entry.contact_name} (${entry.company}) from your outreach list?`
      )
    )
      return;
    const before = entries;
    setEntries((curr) => curr.filter((x) => x.id !== entry.id));
    if (editingId === entry.id) cancelEdit();
    try {
      const res = await fetch(
        `/api/outreach/${entry.id}?email=${encodeURIComponent(identity.email)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      flash("Entry removed.");
    } catch {
      setEntries(before);
      setError("Couldn't delete that entry. Please try again.");
    }
  }

  // ------------------------------------------------------------------
  if (!identityLoaded) return null;

  if (!identity) {
    return (
      <form
        onSubmit={saveIdentity}
        className="rounded-2xl border border-border bg-surface p-6 shadow-card"
      >
        <h2 className="text-base font-semibold text-ink">First, who are you?</h2>
        <p className="mt-1.5 text-sm text-muted">
          We use this to credit your outreach and show you your own list. Your
          phone will remember it.
        </p>
        <div className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="your-name"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Your name <span className="text-crimson">*</span>
            </label>
            <input
              id="your-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field"
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label
              htmlFor="your-email"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Your email <span className="text-crimson">*</span>
            </label>
            <input
              id="your-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
              placeholder="you@example.com"
            />
          </div>
          {error && (
            <p className="text-sm text-crimson" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full py-3">
            Continue
          </button>
        </div>
      </form>
    );
  }

  const companies = new Set(
    entries.map((e) => e.company.trim().toLowerCase())
  ).size;

  return (
    <div className="space-y-8">
      {/* Identity bar */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{identity.name}</p>
          <p className="truncate text-xs text-faint">{identity.email}</p>
        </div>
        <button onClick={switchPerson} className="btn-subtle shrink-0 px-2.5 py-1.5 text-xs">
          Not you?
        </button>
      </div>

      {/* Add / edit form */}
      <form
        onSubmit={submit}
        className="rounded-2xl border border-border bg-surface p-6 shadow-card"
      >
        <h2 className="text-base font-semibold text-ink">
          {editingId ? "Edit outreach entry" : "Log an outreach"}
        </h2>

        {/* Honeypot */}
        <div
          aria-hidden
          className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden"
        >
          <label htmlFor="website-o">Website</label>
          <input
            id="website-o"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="company" className="mb-1.5 block text-sm font-medium text-ink">
              Company <span className="text-crimson">*</span>
            </label>
            <input
              id="company"
              type="text"
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              className="field"
              placeholder="e.g. Goldman Sachs"
            />
          </div>
          <div>
            <label htmlFor="contact-name" className="mb-1.5 block text-sm font-medium text-ink">
              Their name <span className="text-crimson">*</span>
            </label>
            <input
              id="contact-name"
              type="text"
              value={form.contact_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, contact_name: e.target.value }))
              }
              className="field"
              placeholder="e.g. John Smith"
            />
          </div>
          <div>
            <label htmlFor="contact-title" className="mb-1.5 block text-sm font-medium text-ink">
              Their title
            </label>
            <input
              id="contact-title"
              type="text"
              value={form.contact_title}
              onChange={(e) =>
                setForm((f) => ({ ...f, contact_title: e.target.value }))
              }
              className="field"
              placeholder="e.g. Managing Director"
            />
          </div>
          <div>
            <label htmlFor="affiliation" className="mb-1.5 block text-sm font-medium text-ink">
              Harvard affiliation
            </label>
            <input
              id="affiliation"
              type="text"
              list="affiliation-options"
              value={form.harvard_affiliation}
              onChange={(e) =>
                setForm((f) => ({ ...f, harvard_affiliation: e.target.value }))
              }
              className="field"
              placeholder="e.g. HBS MBA 2008"
            />
            <datalist id="affiliation-options">
              {AFFILIATION_SUGGESTIONS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="outreach-date" className="mb-1.5 block text-sm font-medium text-ink">
              Date of outreach
            </label>
            <input
              id="outreach-date"
              type="date"
              value={form.outreach_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, outreach_date: e.target.value }))
              }
              className="field"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="o-notes" className="mb-1.5 block text-sm font-medium text-ink">
              Notes
            </label>
            <textarea
              id="o-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="field resize-y"
              placeholder="e.g. Warm intro via classmate; interested in the $100K tier; following up next week…"
            />
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm text-crimson" role="alert">
            {error}
          </p>
        )}
        {notice && <p className="mt-4 text-sm text-sand">{notice}</p>}

        <div className="mt-5 flex gap-2">
          {editingId && (
            <button type="button" onClick={cancelEdit} className="btn-ghost flex-1 py-3">
              Cancel
            </button>
          )}
          <button type="submit" disabled={saving} className="btn-primary flex-1 py-3">
            {saving
              ? "Saving…"
              : editingId
              ? "Save changes"
              : "Log outreach"}
          </button>
        </div>
      </form>

      {/* Personal list */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-ink">
            Your outreach{" "}
            <span className="text-muted">({entries.length})</span>
          </h2>
          {entries.length > 0 && (
            <span className="text-xs text-faint">
              {companies} compan{companies === 1 ? "y" : "ies"}
            </span>
          )}
        </div>

        {listLoading && entries.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
            Loading your entries…
          </p>
        ) : entries.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
            Nothing logged yet — add the first person you&apos;ve reached out to
            above.
          </p>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl border border-border bg-surface p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-ink">
                      {entry.company}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      {entry.contact_name}
                      {entry.contact_title ? ` — ${entry.contact_title}` : ""}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-faint">
                      {entry.harvard_affiliation && (
                        <span>🎓 {entry.harvard_affiliation}</span>
                      )}
                      {entry.outreach_date && <span>📅 {entry.outreach_date}</span>}
                    </div>
                    {entry.notes && (
                      <p className="mt-2 text-[13px] leading-snug text-muted">
                        {entry.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => startEdit(entry)}
                      className="btn-subtle px-2 py-1 text-xs"
                      aria-label={`Edit ${entry.contact_name}`}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(entry)}
                      className="px-2 py-1 text-xs text-faint transition hover:text-crimson"
                      aria-label={`Delete ${entry.contact_name}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-xs text-faint">
        Entries are shared with the Davos 2027 organizing team to coordinate
        sponsorship outreach.
      </p>
    </div>
  );
}
