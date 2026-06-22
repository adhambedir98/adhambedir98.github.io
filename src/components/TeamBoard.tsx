"use client";

import { WORKSTREAMS } from "@/lib/constants";
import type { Volunteer, WorkstreamKey } from "@/lib/types";

/**
 * Visual board view of the volunteer team: one column per workstream (plus a
 * "Needs follow-up" column for people who haven't picked one), each filled with
 * compact person cards. A volunteer who signed up for several workstreams shows
 * up in each — so you can see who's covering what at a glance.
 *
 * Quick actions (toggle recommended, toggle status) work inline; full editing
 * stays in the table view.
 */

// A subtle accent dot per column so the workstreams are easy to tell apart
// while staying within the warm theme.
const ACCENTS: Record<WorkstreamKey, string> = {
  logistics: "#c9b693", // sand
  sponsorship: "#cf9b57", // bronze
  vip_outreach: "#A51C30", // crimson
  longer_term_strategy: "#8aa6a0", // muted sage
};

type Column = {
  key: WorkstreamKey | "followup";
  label: string;
  accent: string;
  people: Volunteer[];
  copyKey?: WorkstreamKey;
};

export function TeamBoard({
  rows,
  onPatch,
  onCopyEmails,
}: {
  rows: Volunteer[];
  onPatch: (id: string, patch: Partial<Volunteer>) => Promise<boolean>;
  onCopyEmails: (key: WorkstreamKey, label: string) => void;
}) {
  const columns: Column[] = WORKSTREAMS.map((w) => ({
    key: w.key,
    label: w.label,
    accent: ACCENTS[w.key],
    copyKey: w.key,
    people: rows.filter((r) => r[w.key]),
  }));

  const followup = rows.filter(
    (r) =>
      !r.logistics &&
      !r.sponsorship &&
      !r.vip_outreach &&
      !r.longer_term_strategy
  );
  columns.push({
    key: "followup",
    label: "Needs follow-up",
    accent: "#7c715f",
    people: followup,
  });

  return (
    <div className="scroll-thin flex gap-4 overflow-x-auto pb-2">
      {columns.map((col) => (
        <section
          key={col.key}
          className="flex w-[300px] shrink-0 flex-col rounded-xl border border-border bg-surface/50"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: col.accent }}
              />
              <h3 className="truncate text-sm font-semibold text-ink">
                {col.label}
              </h3>
              <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
                {col.people.length}
              </span>
            </div>
            {col.copyKey && col.people.length > 0 && (
              <button
                onClick={() => onCopyEmails(col.copyKey!, col.label)}
                className="shrink-0 text-xs font-medium text-faint transition hover:text-sand"
                title={`Copy ${col.label} emails (BCC)`}
              >
                Copy
              </button>
            )}
          </header>

          <div className="flex flex-col gap-2.5 p-3">
            {col.people.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-faint">
                {col.key === "followup"
                  ? "Everyone has a workstream."
                  : "No one yet."}
              </p>
            ) : (
              col.people.map((v) => (
                <PersonCard key={v.id} v={v} onPatch={onPatch} />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function PersonCard({
  v,
  onPatch,
}: {
  v: Volunteer;
  onPatch: (id: string, patch: Partial<Volunteer>) => Promise<boolean>;
}) {
  const isNew = v.status === "new" && v.source === "self-signup";
  const waDigits = (v.whatsapp ?? "").replace(/\D/g, "");

  return (
    <article
      className={`rounded-xl border p-3.5 transition ${
        isNew
          ? "border-crimson/40 bg-crimson-soft"
          : "border-border bg-surface-2"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium leading-tight text-ink">
            {v.name}
          </div>
          {v.program && (
            <div className="mt-0.5 truncate text-[12px] text-muted">
              {v.program}
            </div>
          )}
        </div>
        <button
          onClick={() => onPatch(v.id, { recommended: !v.recommended })}
          title={v.recommended ? "Recommended" : "Mark recommended"}
          aria-pressed={v.recommended}
          className={`-mr-1 -mt-1 shrink-0 p-1 text-base leading-none transition ${
            v.recommended ? "text-crimson" : "text-faint hover:text-muted"
          }`}
        >
          {v.recommended ? "★" : "☆"}
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {isNew && (
          <span className="rounded bg-crimson px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            New
          </span>
        )}
        <button
          onClick={() =>
            onPatch(v.id, {
              status: v.status === "new" ? "reviewed" : "new",
            })
          }
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
            v.status === "new"
              ? "border-crimson/50 text-ink"
              : "border-border text-muted hover:text-ink"
          }`}
          title={v.status === "new" ? "Mark as reviewed" : "Mark as new"}
        >
          {v.status === "new" ? "New" : "Reviewed"}
        </button>
      </div>

      <div className="mt-2.5 flex items-center gap-3 text-[12px]">
        <a
          href={`mailto:${v.email}`}
          className="min-w-0 truncate text-faint transition hover:text-sand"
          title={v.email}
        >
          {v.email}
        </a>
        {waDigits.length >= 7 && (
          <a
            href={`https://wa.me/${waDigits}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-faint transition hover:text-sand"
            title={`WhatsApp ${v.whatsapp}`}
          >
            WhatsApp
          </a>
        )}
      </div>

      {v.notes && (
        <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-muted">
          {v.notes}
        </p>
      )}
    </article>
  );
}
