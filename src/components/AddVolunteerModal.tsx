"use client";

import { useState } from "react";
import { WORKSTREAMS } from "@/lib/constants";
import type { Volunteer, WorkstreamKey } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AddVolunteerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (v: Volunteer) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [program, setProgram] = useState("");
  const [notes, setNotes] = useState("");
  const [recommended, setRecommended] = useState(false);
  const [ws, setWs] = useState<Record<WorkstreamKey, boolean>>({
    logistics: false,
    sponsorship: false,
    vip_outreach: false,
    longer_term_strategy: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    if (!EMAIL_RE.test(email.trim()))
      return setError("A valid email is required.");

    setSaving(true);
    try {
      const res = await fetch("/api/volunteers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          whatsapp,
          program,
          notes,
          recommended,
          ...ws,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not add volunteer.");
        setSaving(false);
        return;
      }
      onCreated(data.volunteer as Volunteer);
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Add a volunteer</h2>
          <button onClick={onClose} className="btn-subtle px-2 py-1" aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Name <span className="text-crimson">*</span>
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Email <span className="text-crimson">*</span>
              </span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
                inputMode="email"
                autoCapitalize="none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                WhatsApp
              </span>
              <input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="field"
                inputMode="tel"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Program
              </span>
              <input
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                className="field"
                placeholder="e.g. HBS MBA 2027"
              />
            </label>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">
              Workstreams
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {WORKSTREAMS.map((w) => (
                <label
                  key={w.key}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5"
                >
                  <input
                    type="checkbox"
                    checked={ws[w.key]}
                    onChange={() =>
                      setWs((p) => ({ ...p, [w.key]: !p[w.key] }))
                    }
                    className="h-4 w-4 accent-crimson"
                  />
                  <span className="text-sm text-ink">{w.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Notes <span className="text-faint">(admin-only)</span>
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="field resize-y"
              rows={2}
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={recommended}
              onChange={(e) => setRecommended(e.target.checked)}
              className="h-4 w-4 accent-crimson"
            />
            <span className="text-sm text-ink">
              Mark as recommended (strong candidate)
            </span>
          </label>

          {error && (
            <p className="text-sm text-crimson" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Adding…" : "Add volunteer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
