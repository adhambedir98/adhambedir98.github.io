"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WORKSTREAMS, WORKSTREAM_KEYS } from "@/lib/constants";
import type { Volunteer, WorkstreamKey, Status } from "@/lib/types";
import { downloadCsv } from "@/lib/csv";
import { EditableCell } from "./EditableCell";
import { AddVolunteerModal } from "./AddVolunteerModal";
import { Wordmark } from "./Wordmark";

type Toast = { id: number; message: string; tone: "ok" | "error" };

export function Dashboard({ initial }: { initial: Volunteer[] }) {
  const [rows, setRows] = useState<Volunteer[]>(initial);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Filters
  const [search, setSearch] = useState("");
  const [wsFilter, setWsFilter] = useState<WorkstreamKey | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [recFilter, setRecFilter] = useState(false);
  const [followupOnly, setFollowupOnly] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  // ---- Server sync -------------------------------------------------------
  const refresh = useCallback(
    async (silent = true) => {
      if (!silent) setRefreshing(true);
      try {
        const res = await fetch("/api/volunteers", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const { volunteers } = await res.json();
        setRows(volunteers as Volunteer[]);
        if (!silent) notify("Refreshed.");
      } catch {
        if (!silent) notify("Couldn't refresh.", "error");
      } finally {
        if (!silent) setRefreshing(false);
      }
    },
    [notify]
  );

  // Keep the dashboard live: poll every 30s and on tab focus.
  useEffect(() => {
    const interval = setInterval(() => refresh(true), 30_000);
    const onFocus = () => refresh(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const patchVolunteer = useCallback(
    async (id: string, patch: Partial<Volunteer>): Promise<boolean> => {
      const before = rowsRef.current.find((r) => r.id === id);
      // Optimistic update
      setRows((curr) =>
        curr.map((r) => (r.id === id ? { ...r, ...patch } : r))
      );
      try {
        const res = await fetch(`/api/volunteers/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Save failed.");
        }
        const { volunteer } = await res.json();
        setRows((curr) =>
          curr.map((r) => (r.id === id ? (volunteer as Volunteer) : r))
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

  const deleteVolunteer = useCallback(
    async (v: Volunteer) => {
      if (
        !window.confirm(
          `Delete ${v.name} (${v.email})? This can't be undone.`
        )
      )
        return;
      const before = rowsRef.current;
      setRows((curr) => curr.filter((r) => r.id !== v.id));
      try {
        const res = await fetch(`/api/volunteers/${v.id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error();
        notify(`Deleted ${v.name}.`);
      } catch {
        setRows(before);
        notify("Couldn't delete.", "error");
      }
    },
    [notify]
  );

  // ---- Derived ------------------------------------------------------------
  const counts = useMemo(() => {
    const c: Record<WorkstreamKey, number> = {
      logistics: 0,
      sponsorship: 0,
      vip_outreach: 0,
      longer_term_strategy: 0,
    };
    let followup = 0;
    let newCount = 0;
    for (const r of rows) {
      for (const k of WORKSTREAM_KEYS) if (r[k]) c[k] += 1;
      const any =
        r.logistics || r.sponsorship || r.vip_outreach || r.longer_term_strategy;
      if (!any) followup += 1;
      if (r.status === "new" && r.source === "self-signup") newCount += 1;
    }
    return { perWs: c, total: rows.length, followup, newCount };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        q &&
        !`${r.name} ${r.email} ${r.program ?? ""}`.toLowerCase().includes(q)
      )
        return false;
      if (wsFilter && !r[wsFilter]) return false;
      if (recFilter && !r.recommended) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (
        followupOnly &&
        (r.logistics ||
          r.sponsorship ||
          r.vip_outreach ||
          r.longer_term_strategy)
      )
        return false;
      return true;
    });
  }, [rows, search, wsFilter, recFilter, statusFilter, followupOnly]);

  // ---- Email export -------------------------------------------------------
  async function copyEmails(key: WorkstreamKey, label: string) {
    const emails = rows
      .filter((r) => r[key] && r.email)
      .map((r) => r.email);
    if (emails.length === 0) {
      notify(`No emails for ${label} yet.`, "error");
      return;
    }
    const text = emails.join("; "); // semicolons for Outlook BCC
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    notify(`Copied ${emails.length} ${label} email${emails.length === 1 ? "" : "s"}.`);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }

  const activeFilters =
    !!wsFilter ||
    recFilter ||
    statusFilter !== "all" ||
    followupOnly ||
    search.trim() !== "";

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Wordmark subtitle="Volunteer Tracker" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => refresh(false)}
              className="btn-ghost px-3 py-2"
              disabled={refreshing}
              title="Refresh from database"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button onClick={() => setModalOpen(true)} className="btn-primary px-3 py-2">
              + Add volunteer
            </button>
            <button onClick={logout} className="btn-subtle px-3 py-2">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        {/* Workstream counts + per-workstream copy */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {WORKSTREAMS.map((w) => {
            const active = wsFilter === w.key;
            return (
              <div
                key={w.key}
                className={`rounded-xl border bg-surface p-4 shadow-card transition ${
                  active ? "border-sand/50" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => setWsFilter(active ? null : w.key)}
                    className="text-left"
                    title={active ? "Clear filter" : `Filter to ${w.label}`}
                  >
                    <div className="text-[28px] font-semibold leading-none text-ink">
                      {counts.perWs[w.key]}
                    </div>
                    <div className="mt-1.5 text-[13px] font-medium text-muted">
                      {w.label}
                    </div>
                  </button>
                </div>
                <button
                  onClick={() => copyEmails(w.key, w.label)}
                  className="mt-3 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-muted transition hover:border-sand/40 hover:text-ink"
                >
                  Copy emails (BCC)
                </button>
              </div>
            );
          })}
        </section>

        {/* Secondary stats */}
        <section className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="chip">
            <strong className="text-ink">{counts.total}</strong> total
          </span>
          <button
            onClick={() => {
              setFollowupOnly((v) => !v);
            }}
            className={`chip ${followupOnly ? "chip-active" : ""} ${
              counts.followup > 0 ? "border-crimson/40" : ""
            }`}
            title="Anyone with zero workstreams selected"
          >
            <strong className="text-ink">{counts.followup}</strong> needs follow-up
          </button>
          <button
            onClick={() =>
              setStatusFilter((s) => (s === "new" ? "all" : "new"))
            }
            className={`chip ${statusFilter === "new" ? "chip-active" : ""}`}
            title="New self-signups awaiting triage"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-crimson" />
            <strong className="text-ink">{counts.newCount}</strong> new sign-ups
          </button>
        </section>

        {/* Filter / search bar */}
        <section className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email…"
              className="field max-w-xs flex-1 py-2"
            />
            <FilterChip
              label="Recommended"
              active={recFilter}
              onClick={() => setRecFilter((v) => !v)}
            />
            <StatusSelect value={statusFilter} onChange={setStatusFilter} />
            {activeFilters && (
              <button
                onClick={() => {
                  setSearch("");
                  setWsFilter(null);
                  setStatusFilter("all");
                  setRecFilter(false);
                  setFollowupOnly(false);
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
                downloadCsv(
                  rows,
                  `davos-2027-volunteers-${new Date()
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
                  <Th className="w-10 text-center">★</Th>
                  <Th className="min-w-[150px]">Name</Th>
                  <Th className="min-w-[210px]">Email</Th>
                  <Th className="min-w-[140px]">WhatsApp</Th>
                  <Th className="min-w-[130px]">Program</Th>
                  {WORKSTREAMS.map((w) => (
                    <Th key={w.key} className="w-[58px] text-center">
                      <span title={w.label}>{w.short}</span>
                    </Th>
                  ))}
                  <Th className="w-[112px] text-center">Status</Th>
                  <Th className="min-w-[220px]">Notes</Th>
                  <Th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <Row
                    key={v.id}
                    v={v}
                    onPatch={patchVolunteer}
                    onDelete={deleteVolunteer}
                  />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-4 py-14 text-center text-sm text-muted"
                    >
                      No volunteers match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-4 text-xs text-faint">
          Tip: paste{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 text-sand">/join</code>{" "}
          into your WhatsApp group. New self-signups appear here highlighted as{" "}
          <span className="text-crimson">New</span> for you to review.
        </p>
      </main>

      {modalOpen && (
        <AddVolunteerModal
          onClose={() => setModalOpen(false)}
          onCreated={(v) => {
            setRows((curr) => [v, ...curr]);
            setModalOpen(false);
            notify(`Added ${v.name}.`);
          }}
        />
      )}

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

// ---------------------------------------------------------------------------

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-3 py-3 font-medium ${className}`}>{children}</th>
  );
}

function Row({
  v,
  onPatch,
  onDelete,
}: {
  v: Volunteer;
  onPatch: (id: string, patch: Partial<Volunteer>) => Promise<boolean>;
  onDelete: (v: Volunteer) => void;
}) {
  const isNew = v.status === "new" && v.source === "self-signup";

  return (
    <tr
      className={`border-b border-border/70 align-top transition hover:bg-surface-2/50 ${
        isNew ? "bg-crimson-soft" : ""
      }`}
    >
      {/* Recommended */}
      <td className="px-2 py-2 text-center">
        <button
          onClick={() => onPatch(v.id, { recommended: !v.recommended })}
          title={v.recommended ? "Recommended" : "Mark recommended"}
          className={`text-lg leading-none transition ${
            v.recommended ? "text-crimson" : "text-faint hover:text-muted"
          }`}
          aria-pressed={v.recommended}
        >
          {v.recommended ? "★" : "☆"}
        </button>
      </td>

      {/* Name */}
      <td className="px-1.5 py-2">
        <div className="flex items-center gap-1.5">
          {isNew && (
            <span className="shrink-0 rounded bg-crimson px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              New
            </span>
          )}
          <EditableCell
            value={v.name}
            ariaLabel="Name"
            onSave={(next) => onPatch(v.id, { name: next })}
            inputClassName="font-medium"
          />
        </div>
      </td>

      {/* Email */}
      <td className="px-1.5 py-2">
        <EditableCell
          value={v.email}
          ariaLabel="Email"
          onSave={(next) => onPatch(v.id, { email: next })}
        />
      </td>

      {/* WhatsApp */}
      <td className="px-1.5 py-2">
        <EditableCell
          value={v.whatsapp}
          ariaLabel="WhatsApp"
          placeholder="—"
          onSave={(next) => onPatch(v.id, { whatsapp: next })}
        />
      </td>

      {/* Program */}
      <td className="px-1.5 py-2">
        <EditableCell
          value={v.program}
          ariaLabel="Program"
          placeholder="—"
          onSave={(next) => onPatch(v.id, { program: next })}
        />
      </td>

      {/* Workstreams */}
      {WORKSTREAM_KEYS.map((k) => (
        <td key={k} className="px-1 py-2 text-center">
          <input
            type="checkbox"
            checked={v[k]}
            onChange={() => onPatch(v.id, { [k]: !v[k] } as Partial<Volunteer>)}
            className="h-4 w-4 accent-crimson"
            aria-label={k}
          />
        </td>
      ))}

      {/* Status */}
      <td className="px-2 py-2 text-center">
        <button
          onClick={() =>
            onPatch(v.id, {
              status: v.status === "new" ? "reviewed" : "new",
            })
          }
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
            v.status === "new"
              ? "border-crimson/50 bg-crimson-soft text-ink"
              : "border-border bg-surface-2 text-muted hover:text-ink"
          }`}
          title={
            v.status === "new"
              ? "Mark as reviewed"
              : "Mark as new"
          }
        >
          {v.status === "new" ? "New" : "Reviewed"}
        </button>
      </td>

      {/* Notes */}
      <td className="px-1.5 py-2">
        <EditableCell
          value={v.notes}
          ariaLabel="Notes"
          placeholder="Add a note…"
          multiline
          onSave={(next) => onPatch(v.id, { notes: next })}
        />
      </td>

      {/* Delete */}
      <td className="px-2 py-2 text-center">
        <button
          onClick={() => onDelete(v)}
          className="text-faint transition hover:text-crimson"
          title="Delete volunteer"
          aria-label={`Delete ${v.name}`}
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`chip ${active ? "chip-active" : ""}`}>
      {active && <span className="h-1.5 w-1.5 rounded-full bg-crimson" />}
      {label}
    </button>
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: "all" | Status;
  onChange: (v: "all" | Status) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as "all" | Status)}
      className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted outline-none transition focus:border-sand/50"
      aria-label="Filter by status"
    >
      <option value="all">All statuses</option>
      <option value="new">New only</option>
      <option value="reviewed">Reviewed only</option>
    </select>
  );
}
