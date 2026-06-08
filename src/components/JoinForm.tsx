"use client";

import { useState } from "react";
import { WORKSTREAMS, PROGRAM_OPTIONS } from "@/lib/constants";
import type { WorkstreamKey } from "@/lib/types";

type WsState = Record<WorkstreamKey, boolean>;

const EMPTY_WS: WsState = {
  logistics: false,
  sponsorship: false,
  vip_outreach: false,
  longer_term_strategy: false,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function JoinForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [program, setProgram] = useState("");
  const [background, setBackground] = useState("");
  const [ws, setWs] = useState<WsState>(EMPTY_WS);
  const [website, setWebsite] = useState(""); // honeypot

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ name: string; workstreams: string[] } | null>(
    null
  );

  function toggle(key: WorkstreamKey) {
    setWs((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Please enter your name.");
    if (!EMAIL_RE.test(email.trim()))
      return setError("Please enter a valid email address.");
    if (whatsapp.replace(/\D/g, "").length < 7)
      return setError("Please enter a valid WhatsApp number.");

    setLoading(true);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          whatsapp: whatsapp.trim(),
          program,
          background,
          website, // honeypot
          ...ws,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      setDone({ name: data.name || name.trim(), workstreams: data.workstreams ?? [] });
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  }

  if (done) {
    return <Confirmation name={done.name} workstreams={done.workstreams} />;
  }

  const selectedCount = Object.values(ws).filter(Boolean).length;

  return (
    <form onSubmit={handleSubmit} className="space-y-7" noValidate>
      {/* Honeypot — visually hidden, off-screen, not announced. Bots fill it. */}
      <div aria-hidden className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <Field label="Name" htmlFor="name" required>
        <input
          id="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field"
          placeholder="Jane Doe"
        />
      </Field>

      <Field label="Email" htmlFor="email" required>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
          placeholder="you@example.com"
        />
      </Field>

      <Field
        label="WhatsApp number"
        htmlFor="whatsapp"
        required
        hint="Include your country code, e.g. +1 617 555 0123"
      >
        <input
          id="whatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          className="field"
          placeholder="+1 617 555 0123"
        />
      </Field>

      <Field label="Program / affiliation" htmlFor="program">
        <select
          id="program"
          value={program}
          onChange={(e) => setProgram(e.target.value)}
          className="field appearance-none"
        >
          <option value="">Select one…</option>
          {PROGRAM_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink">
          Which workstreams can you help with?
        </legend>
        <p className="mb-3 text-[13px] text-muted">
          Pick any that fit — most people choose one or two.
        </p>
        <div className="space-y-3">
          {WORKSTREAMS.map((w) => {
            const active = ws[w.key];
            return (
              <label
                key={w.key}
                className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${
                  active
                    ? "border-sand/50 bg-crimson-soft"
                    : "border-border bg-surface hover:border-sand/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggle(w.key)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-crimson"
                />
                <span>
                  <span className="block text-[15px] font-medium text-ink">
                    {w.label}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                    {w.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {selectedCount === 0 && (
          <p className="mt-2 text-[13px] text-faint">
            Not sure yet? You can still sign up and we&apos;ll help you find a fit.
          </p>
        )}
      </fieldset>

      <Field
        label="Anything else / relevant background"
        htmlFor="background"
        hint="Optional — connections, past events, languages, availability…"
      >
        <textarea
          id="background"
          rows={4}
          value={background}
          onChange={(e) => setBackground(e.target.value)}
          className="field resize-y"
          placeholder="e.g. Worked on logistics for a conference at Davos; have media contacts…"
        />
      </Field>

      {error && (
        <p className="text-sm text-crimson" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-base">
        {loading ? "Submitting…" : "Count me in"}
      </button>

      <p className="text-center text-xs text-faint">
        Your details are shared only with the Davos 2027 organizing team.
      </p>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-medium text-ink"
      >
        {label}
        {required && <span className="ml-1 text-crimson">*</span>}
      </label>
      {hint && <p className="mb-2 text-[13px] text-muted">{hint}</p>}
      {children}
    </div>
  );
}

function Confirmation({
  name,
  workstreams,
}: {
  name: string;
  workstreams: string[];
}) {
  const firstName = name.split(" ")[0] || name;
  const list =
    workstreams.length === 0
      ? null
      : workstreams.length === 1
      ? workstreams[0]
      : workstreams.length === 2
      ? `${workstreams[0]} and ${workstreams[1]}`
      : `${workstreams.slice(0, -1).join(", ")}, and ${
          workstreams[workstreams.length - 1]
        }`;

  return (
    <div className="rounded-2xl border border-border bg-surface p-7 text-center shadow-card">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-crimson-soft">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#A51C30"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h2 className="mt-5 text-xl font-semibold text-ink">
        Thanks, {firstName} — you&apos;re signed up.
      </h2>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted">
        {list ? (
          <>
            You&apos;re on the list to help with <strong className="text-sand">{list}</strong>.
          </>
        ) : (
          <>You&apos;re on the list. We&apos;ll help you find the right workstream.</>
        )}{" "}
        We&apos;ll be in touch about Davos 2027.
      </p>
      <p className="mt-6 text-[13px] text-faint">
        Signed up with the wrong details or want to change your workstreams? Just
        submit the form again with the same email — it&apos;ll update your entry.
      </p>
    </div>
  );
}
