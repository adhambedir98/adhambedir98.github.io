"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OutreachEntry } from "@/lib/types";
import { downloadTableCsv } from "@/lib/csv";
import { EditableCell } from "./EditableCell";
import { Wordmark } from "./Wordmark";

type Toast = { id: number; message: string; tone: "ok" | "error" };

const CSV_COLUMNS = [
  "submitter_name",
  "submitter_email",
  "company",
  "contact_name",
  "contact_title",
  "harvard_affiliation",
  "outreach_date",
  "notes",
  "created_at",
  "updated_at",
];

export function OutreachAdmin({ initial }: { initial: OutreachEntry[] }) {
  const [rows, setRows] = useState<OutreachEntry[]>(initial);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const [search, setSearch] = useState("");
  const [submitterFilter, setSubmitterFilter] = useState<"all" | string>("all");
  const [dupOnly, setDupOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Bumped on every successful local mutation. A background refresh only
  // applies its (possibly stale) response if no mutation landed after the
  // fetch was dispatched — otherwise a slow poll would visibly revert a
  // just-saved edit until the next poll.
  const mutationVersion = useRef(0);

  const notify = useCallback((message: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const refresh = useCallback(
    async (silent = true) => {
      if (!silent) setRefreshing(true);
      const startVersion = mutationVersion.current;
      try {
        const res = await fetch("/api/outreach", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const { entries } = await res.json();
        if (mutationVersion.current === startVersion) {
          setRows(entries as OutreachEntry[]);
        }
        if (!silent) notify("Refreshed.");
      } catch {
        if (!silent) notify("Couldn't refresh.", "error");
      } finally {
        if (!silent) setRefreshing(false);
      }
    },
    [notify]
  );

  useEffect(() => {
    const interval = setInterval(() => refresh(true), 30_000);
    const onFocus = () => refresh(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const patchEntry = useCallback(
    async (id: string, patch: Partial<OutreachEntry>): Promise<boolean> => {
      const before = rowsRef.current.find((r) => r.id === id);
      setRows((curr) => curr.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      try {
        const res = await fetch(`/api/outreach/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Save failed.");
        }
        const { entry } = await res.json();
        mutationVersion.current += 1;
        setRows((curr) =>
          curr.map((r) => (r.id === id ? (entry as OutreachEntry) : r))
        );
        return true;
      } catch (e) {
        if (before)
          setRows((curr) => curr.map((r) => (r.id === id ? before : r)));
        notify(e instanceof Error ? e.message : "Save failed.", "error");
        return false;
      }
    },
    [notify]
  );

  const deleteEntry = useCallback(
    async (entry: OutreachEntry) => {
      if (
        !window.confirm(
          `Delete ${entry.contact_name} (${entry.company}), logged by ${entry.submitter_name}? This can't be undone.`
        )
      )
        return;
      setRows((curr) => curr.filter((r) => r.id !== entry.id));
      try {
        const res = await fetch(`/api/outreach/${entry.id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error();
        mutationVersion.current += 1;
        notify("Entry deleted.");
      } catch {
        // Restore only the row this delete removed — a whole-list snapshot
        // would resurrect rows deleted (or overwrite rows edited) meanwhile.
        setRows((curr) =>
          curr.some((r) => r.id === entry.id) ? curr : [entry, ...curr]
        );
        notify("Couldn't delete.", "error");
      }
    },
    [notify]
  );

  // ---- Derived ------------------------------------------------------------
  const companyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const key = r.company.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  const submitters = useMemo(() => {
    const map = new Map<string, string>(); // email -> name
    for (const r of rows) {
      if (!map.has(r.submitter_email)) map.set(r.submitter_email, r.submitter_name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const stats = useMemo(() => {
    const dupCompanies = Array.from(companyCounts.values()).filter(
      (n) => n > 1
    ).length;
    return {
      total: rows.length,
      companies: companyCounts.size,
      submitters: submitters.length,
      dupCompanies,
    };
  }, [rows, companyCounts, submitters]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        q &&
        !`${r.company} ${r.contact_name} ${r.contact_title ?? ""} ${
          r.harvard_affiliation ?? ""
        } ${r.submitter_name} ${r.submitter_email} ${r.notes ?? ""}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      if (submitterFilter !== "all" && r.submitter_email !== submitterFilter)
        return false;
      if (dupOnly && (companyCounts.get(r.company.trim().toLowerCase()) ?? 0) < 2)
        return false;
      return true;
    });
  }, [rows, search, submitterFilter, dupOnly, companyCounts]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Wordmark subtitle="Sponsorship Outreach" />
          <div className="flex items-center gap-2">
            <a href="/" className="btn-subtle px-3 py-2">
              ← Volunteers
            </a>
            <button
              onClick={() => refresh(false)}
              className="btn-ghost px-3 py-2"
              disabled={refreshing}
              title="Refresh from database"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        {/* Stats */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard value={stats.total} label="Outreach entries" />
          <StatCard value={stats.companies} label="Companies contacted" />
          <StatCard value={stats.submitters} label="Volunteers contributing" />
          <button
            onClick={() => setDupOnly((v) => !v)}
            className={`rounded-xl border bg-surface p-4 text-left shadow-card transition ${
              dupOnly ? "border-sand/50" : "border-border"
            }`}
            title="Companies logged by more than one entry — check for double-contacting"
          >
            <div className="text-[28px] font-semibold leading-none text-ink">
              {stats.dupCompanies}
            </div>
            <div className="mt-1.5 text-[13px] font-medium text-muted">
              Companies with multiple entries
            </div>
          </button>
        </section>

        {/* Filters */}
        <section className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company, contact, volunteer…"
              className="field max-w-xs flex-1 py-2"
            />
            <select
              value={submitterFilter}
              onChange={(e) => setSubmitterFilter(e.target.value)}
              className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted outline-none transition focus:border-sand/50"
              aria-label="Filter by volunteer"
            >
              <option value="all">All volunteers</option>
              {submitters.map(([em, nm]) => (
                <option key={em} value={em}>
                  {nm}
                </option>
              ))}
            </select>
            {(search || submitterFilter !== "all" || dupOnly) && (
              <button
                onClick={() => {
                  setSearch("");
                  setSubmitterFilter("all");
                  setDupOnly(false);
                }}
                className="btn-subtle px-2.5 py-1.5 text-xs"
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-faint">
              Showing {filtered.length} of {rows.length}
            </span>
            <button
              onClick={() =>
                downloadTableCsv(
                  CSV_COLUMNS,
                  rows as unknown as Record<string, unknown>[],
                  `davos-2027-sponsorship-outreach-${new Date()
                    .toISOString()
                    .slice(0, 10)}.csv`
                )
              }
              className="btn-ghost px-3 py-2 text-sm"
            >
              Download CSV
            </button>
          </div>
        </section>

        {/* Table */}
        <section className="mt-4 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-faint">
                  <Th className="min-w-[150px]">Volunteer</Th>
                  <Th className="min-w-[160px]">Company</Th>
                  <Th className="min-w-[150px]">Contact</Th>
                  <Th className="min-w-[140px]">Title</Th>
                  <Th className="min-w-[140px]">Harvard affiliation</Th>
                  <Th className="w-[150px]">Date</Th>
                  <Th className="min-w-[220px]">Notes</Th>
                  <Th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const dup =
                    (companyCounts.get(r.company.trim().toLowerCase()) ?? 0) > 1;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border/70 align-top transition hover:bg-surface-2/50"
                    >
                      <td className="px-3 py-2.5">
                        <p className="text-sm font-medium text-ink">
                          {r.submitter_name}
                        </p>
                        <p className="text-xs text-faint">{r.submitter_email}</p>
                      </td>
                      <td className="px-1.5 py-2">
                        <div className="flex items-center gap-1.5">
                          {dup && (
                            <span
                              className="shrink-0 rounded bg-crimson-soft px-1.5 py-0.5 text-[10px] font-semibold text-sand"
                              title="Multiple entries for this company — check for overlap"
                            >
                              ×{companyCounts.get(r.company.trim().toLowerCase())}
                            </span>
                          )}
                          <EditableCell
                            value={r.company}
                            ariaLabel="Company"
                            onSave={(next) => patchEntry(r.id, { company: next })}
                            inputClassName="font-medium"
                          />
                        </div>
                      </td>
                      <td className="px-1.5 py-2">
                        <EditableCell
                          value={r.contact_name}
                          ariaLabel="Contact name"
                          onSave={(next) =>
                            patchEntry(r.id, { contact_name: next })
                          }
                        />
                      </td>
                      <td className="px-1.5 py-2">
                        <EditableCell
                          value={r.contact_title}
                          ariaLabel="Contact title"
                          placeholder="—"
                          onSave={(next) =>
                            patchEntry(r.id, { contact_title: next })
                          }
                        />
                      </td>
                      <td className="px-1.5 py-2">
                        <EditableCell
                          value={r.harvard_affiliation}
                          ariaLabel="Harvard affiliation"
                          placeholder="—"
                          onSave={(next) =>
                            patchEntry(r.id, { harvard_affiliation: next })
                          }
                        />
                      </td>
                      <td className="px-1.5 py-2">
                        <DateCell
                          value={r.outreach_date}
                          onSave={(next) =>
                            patchEntry(r.id, { outreach_date: next })
                          }
                        />
                      </td>
                      <td className="px-1.5 py-2">
                        <EditableCell
                          value={r.notes}
                          ariaLabel="Notes"
                          placeholder="Add a note…"
                          multiline
                          onSave={(next) => patchEntry(r.id, { notes: next })}
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => deleteEntry(r)}
                          className="text-faint transition hover:text-crimson"
                          title="Delete entry"
                          aria-label={`Delete ${r.contact_name}`}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-14 text-center text-sm text-muted"
                    >
                      {rows.length === 0
                        ? "No outreach logged yet. Share the /sponsorship link with the team to get started."
                        : "No entries match these filters."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-4 text-xs text-faint">
          Tip: share{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 text-sand">
            /sponsorship
          </code>{" "}
          with the sponsorship team. Everyone logs their own outreach there, and
          it all lands here.
        </p>
      </main>

      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-lg border px-4 py-2.5 text-sm shadow-card ${
              t.tone === "error"
                ? "border-crimson/50 bg-surface text-ink"
                : "border-border bg-surface text-ink"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Date picker that commits ONCE on blur (like EditableCell). A raw onChange →
 * PATCH would fire on every keystroke segment, persisting garbage intermediate
 * dates (typing "2026" fires 0002, 0020, 0202…) and racing in-flight requests.
 * While focused it ignores external row updates so polls can't clobber typing.
 */
function DateCell({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (next: string | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(value ?? "");
  }, [value]);

  async function commit() {
    focusedRef.current = false;
    const next = draft || null;
    if (next === (value ?? null)) {
      setDraft(value ?? "");
      return;
    }
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (!ok) setDraft(value ?? "");
  }

  return (
    <input
      type="date"
      value={draft}
      disabled={saving}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value ?? "");
          (e.target as HTMLInputElement).blur();
        }
      }}
      aria-label="Outreach date"
      className={`w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-ink outline-none transition hover:border-border focus:border-sand/60 focus:bg-surface-2 ${
        saving ? "opacity-60" : ""
      }`}
    />
  );
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="text-[28px] font-semibold leading-none text-ink">
        {value}
      </div>
      <div className="mt-1.5 text-[13px] font-medium text-muted">{label}</div>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <th className={`px-3 py-3 font-medium ${className}`}>{children}</th>;
}
