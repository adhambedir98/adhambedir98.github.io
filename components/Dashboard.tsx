"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DAILY_SEND_CAP, OUTREACH_SENDER, TARGET_SOURCE } from "@/lib/config";
import { STATUS_OPTIONS, statusColor, statusLabel } from "@/lib/statuses";
import {
  assignVariants, computeMetrics, draft, pickTargets,
  type Contact, type Outreach, type Reply, type Variant,
} from "@/lib/pipeline";
import QueueCard from "@/components/QueueCard";

const MapTab = dynamic(() => import("@/components/MapTab"), {
  ssr: false,
  loading: () => <p className="muted">Loading map…</p>,
});

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function Dashboard({ email }: { email: string }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"queue" | "contacts" | "map">("queue");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [outreach, setOutreach] = useState<Outreach[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);

  const [industryFilter, setIndustryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    const [c, v, o, r] = await Promise.all([
      supabase.from("contacts").select("*").order("created_at"),
      supabase.from("message_variants").select("*").order("label"),
      supabase.from("outreach").select("*").order("created_at", { ascending: false }),
      supabase.from("replies").select("id,outreach_id,classification"),
    ]);
    setContacts((c.data as Contact[]) || []);
    setVariants((v.data as Variant[]) || []);
    setOutreach((o.data as Outreach[]) || []);
    setReplies((r.data as Reply[]) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const contactById = useMemo(
    () => Object.fromEntries(contacts.map((c) => [c.id, c])) as Record<string, Contact>,
    [contacts],
  );
  const queued = useMemo(
    () => outreach.filter((o) => o.status === "queued" && o.channel === "hbs_directory" && o.is_first_touch),
    [outreach],
  );
  const metrics = useMemo(() => computeMetrics(outreach, replies, variants, contacts), [outreach, replies, variants, contacts]);

  const industries = useMemo(() => {
    const m: Record<string, number> = {};
    contacts.forEach((c) => (m[c.industry] = (m[c.industry] || 0) + 1));
    return m;
  }, [contacts]);
  const industryList = useMemo(() => Object.keys(industries).sort(), [industries]);
  const locations = useMemo(
    () => Array.from(new Set(contacts.map((c) => c.location).filter(Boolean) as string[])).sort(),
    [contacts],
  );
  const owners = useMemo(
    () => Array.from(new Set(contacts.map((c) => c.owner).filter(Boolean) as string[])).sort(),
    [contacts],
  );

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter(
      (c) =>
        (industryFilter === "all" || c.industry === industryFilter) &&
        (statusFilter === "all" || c.status === statusFilter) &&
        (locationFilter === "all" || c.location === locationFilter) &&
        (ownerFilter === "all" || c.owner === ownerFilter) &&
        (!q || `${c.contact_name} ${c.company} ${c.role || ""}`.toLowerCase().includes(q)),
    );
  }, [contacts, industryFilter, statusFilter, locationFilter, ownerFilter, search]);

  async function generateQueue() {
    setBusy(true); setMsg(null);
    try {
      const { data: cts } = await supabase.from("contacts").select("*")
        .eq("source", TARGET_SOURCE).eq("status", "to_contact");
      const { data: ft } = await supabase.from("outreach").select("contact_id").eq("is_first_touch", true);
      const already = new Set((ft || []).map((r: any) => r.contact_id));
      const pool = ((cts as Contact[]) || []).filter((c) => !already.has(c.id));
      if (!pool.length) { setMsg("No eligible HBS contacts left to queue."); return; }
      const targets = pickTargets(pool, DAILY_SEND_CAP);
      const { data: vars } = await supabase.from("message_variants").select("*").eq("active", true).order("label");
      if (!vars || !vars.length) { setMsg("No active message variants — add one in Supabase."); return; }
      const { data: sentFt } = await supabase.from("outreach").select("variant_id").eq("is_first_touch", true);
      const counts: Record<string, number> = {};
      (sentFt || []).forEach((r: any) => { if (r.variant_id) counts[r.variant_id] = (counts[r.variant_id] || 0) + 1; });
      const assignments = assignVariants(targets, vars as Variant[], counts);
      const rows = assignments.map(([c, v]) => {
        const d = draft(c, v);
        return {
          contact_id: c.id, sender: OUTREACH_SENDER, channel: "hbs_directory",
          is_first_touch: true, variant_id: v.id, subject: d.subject, body: d.body, status: "queued",
        };
      });
      const { error } = await supabase.from("outreach").insert(rows);
      setMsg(error ? `Error: ${error.message}` : `Queued ${rows.length} new first-touch message(s).`);
      await load();
    } finally { setBusy(false); }
  }

  async function markSent(o: Outreach) {
    setBusy(true);
    const now = new Date().toISOString();
    await supabase.from("outreach").update({ status: "sent", sent_at: now }).eq("id", o.id);
    await supabase.from("contacts").update({ status: "contacted", last_contacted_at: now }).eq("id", o.contact_id);
    await load();
    setBusy(false);
  }

  async function saveEmail(id: string, subject: string, body: string) {
    await supabase.from("outreach").update({ subject, body }).eq("id", id);
    await load();
    setMsg("Saved edits to the message.");
  }

  // metrics caveat
  const variantRows = Object.entries(metrics.perVariant).sort(([a], [b]) => a.localeCompare(b));
  const totalSent = variantRows.reduce((s, [, v]) => s + v.sent, 0);
  const totalReal = variantRows.reduce((s, [, v]) => s + v.real, 0);
  const small = variantRows.length === 0 || totalSent < 60 || variantRows.some(([, v]) => v.sent < 30) || totalReal < 10;

  return (
    <main className="wrap">
      <div className="header">
        <div>
          <h1>Vound outreach</h1>
          <div className="who">HBS first-touch · review and send · {email}</div>
        </div>
        <button className="ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>

      <div className="metrics">
        <div className="col">
          <h3>Reply rate by variant</h3>
          <table><tbody>
            {variantRows.length === 0 && <tr><td className="muted">No first-touch sent yet.</td></tr>}
            {variantRows.map(([label, v]) => (
              <tr key={label}><td>Variant {label}</td>
                <td className="r">{v.real}/{v.sent} = {v.sent ? ((v.real / v.sent) * 100).toFixed(1) : "0.0"}%</td></tr>
            ))}
          </tbody></table>
          {variantRows.length > 0 && (
            <p className="caveat">{small
              ? "Sample still small, do not call it yet. Aim for ~30+ sent per variant and 10+ real replies."
              : "Sample is becoming meaningful; watch the gap but confirm it holds."}</p>
          )}
        </div>
        <div className="col">
          <h3>Reply rate by industry</h3>
          <table><tbody>
            {Object.entries(metrics.perIndustry).sort(([, a], [, b]) => b.sent - a.sent).map(([ind, v]) => (
              <tr key={ind}><td>{ind}</td>
                <td className="r">{v.real}/{v.sent} = {v.sent ? ((v.real / v.sent) * 100).toFixed(1) : "0.0"}%</td></tr>
            ))}
            {Object.keys(metrics.perIndustry).length === 0 && <tr><td className="muted">None yet.</td></tr>}
          </tbody></table>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "queue" ? "active" : ""}`} onClick={() => setTab("queue")}>Today&apos;s queue ({queued.length})</button>
        <button className={`tab ${tab === "contacts" ? "active" : ""}`} onClick={() => setTab("contacts")}>Contacts ({contacts.length})</button>
        <button className={`tab ${tab === "map" ? "active" : ""}`} onClick={() => setTab("map")}>Map</button>
      </div>

      {msg && <p className="caveat" style={{ marginBottom: 16 }}>{msg}</p>}
      {loading && <p className="muted">Loading…</p>}

      {!loading && tab === "queue" && (
        <>
          <div className="bar">
            <span className="count">{queued.length} first-touch queued. Edit any message, then send it yourself in the HBS directory and mark it sent.</span>
            <button onClick={generateQueue} disabled={busy}>{busy ? "Working…" : `Generate ${DAILY_SEND_CAP}`}</button>
          </div>
          {queued.length === 0 && <div className="card"><span className="notes">No messages queued. Click “Generate”.</span></div>}
          {queued.map((o) => {
            const c = contactById[o.contact_id] || ({} as Contact);
            return <QueueCard key={o.id} o={o} c={c} onSave={saveEmail} onMarkSent={markSent} busy={busy} />;
          })}
        </>
      )}

      {!loading && tab === "contacts" && (
        <>
          <div className="filters">
            <select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)}>
              <option value="all">All industries ({contacts.length})</option>
              {Object.entries(industries).sort(([, a], [, b]) => b - a).map(([ind, n]) => (
                <option key={ind} value={ind}>{ind} ({n})</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
            <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
              <option value="all">All owners</option>
              {owners.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
              <option value="all">All locations</option>
              {locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <input placeholder="Search name / company / role" value={search}
              onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
            <button className="ghost" onClick={() => { setIndustryFilter("all"); setStatusFilter("all"); setOwnerFilter("all"); setLocationFilter("all"); setSearch(""); }}>Clear</button>
            <span className="count">{filteredContacts.length} shown</span>
          </div>
          <div className="tablewrap">
            <table className="contacts">
              <thead>
                <tr>
                  <th>Name</th><th>Company</th><th>Location</th><th>Industry</th><th>Owner</th>
                  <th>Status</th><th>Added</th><th>Last contacted</th><th>Email</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.contact_name}<div className="muted" style={{ fontSize: 12 }}>{c.role}</div></td>
                    <td>{c.company}</td>
                    <td><button className="linklike" onClick={() => setLocationFilter(c.location || "all")}>{c.location || "—"}</button></td>
                    <td><span className="pill">{c.industry}</span></td>
                    <td>{c.owner ? <button className="linklike" onClick={() => setOwnerFilter(c.owner!)}>{c.owner}</button> : "—"}</td>
                    <td><span className="statuspill" style={{ color: statusColor(c.status), borderColor: statusColor(c.status) }}>{statusLabel(c.status)}</span></td>
                    <td className="muted">{fmtDate(c.created_at)}</td>
                    <td className="muted">{fmtDate(c.last_contacted_at)}</td>
                    <td>{c.email || <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && tab === "map" && <MapTab contacts={contacts} industries={industryList} />}
    </main>
  );
}
