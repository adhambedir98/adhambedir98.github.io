// Outreach pipeline logic, ported to TypeScript and run client-side under the
// authenticated session. Mirrors the Python agent: target selection, balanced A/B
// assignment, drafting + personalization, and reply-rate metrics.

export type Contact = {
  id: string; company: string; contact_name: string; role: string | null;
  location: string | null; email: string | null; source: string; owner: string | null;
  warm_cold: string | null; industry: string; category: string | null; tier: string | null;
  status: string; notes: string | null; last_contacted_at: string | null; created_at: string;
};
export type Variant = { id: string; label: string; subject: string; body: string; active: boolean };
export type Outreach = {
  id: string; contact_id: string; sender: string; channel: string; is_first_touch: boolean;
  variant_id: string | null; subject: string | null; body: string | null; status: string;
  queued_at: string | null; sent_at: string | null; replied_at: string | null; created_at: string;
};
export type Reply = { id: string; outreach_id: string | null; classification: string | null };

const TITLES = new Set(["mr", "mrs", "ms", "dr", "prof", "mx", "sir"]);

export function firstName(name: string | null): string {
  if (!name) return "there";
  const cleaned = name.replace(/\(.*?\)/g, "").trim();
  let toks = cleaned.split(/\s+/).filter(Boolean);
  while (toks.length && TITLES.has(toks[0].toLowerCase().replace(/\./g, ""))) toks.shift();
  if (!toks.length) return "there";
  return toks[0].replace(/[,.]/g, "") || "there";
}

const INDUSTRY_HUMAN: Record<string, string | null> = {
  agriculture: "agriculture",
  food_and_beverage: "food and beverage",
  manufacturing: "manufacturing",
  logistics_and_warehousing: "logistics",
  construction: "construction",
  mining: "mining",
  recycling_and_waste: "recycling and waste",
  auto_and_fleet: "fleet and equipment",
  ports: "ports and container logistics",
  other: null,
};

function stableChoice(seed: string, n: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % n;
}

function cleanRole(role: string | null): string | null {
  if (!role) return null;
  const r = role.trim().replace(/^\(+|\)+$/g, "").trim();
  return r || null;
}

// One specific line built ONLY from public fields (role/company/location/industry).
// Never uses notes (internal). A starting suggestion you refine before sending.
export function personalizeLine(c: Contact): string | null {
  const company = (c.company || "").trim();
  if (!company) return null;
  const role = cleanRole(c.role);
  const location = (c.location || "").trim() || null;
  const ind = INDUSTRY_HUMAN[(c.industry || "").trim()];
  const opts: string[] = [];
  if (role) opts.push(`Your work as ${role} at ${company} is close to the kind of operation we are trying to learn from this summer.`);
  if (ind && location) opts.push(`I came across ${company} while looking at ${ind} operators around ${location}, and I would value how you see things from where you sit.`);
  if (ind) opts.push(`I have been mapping how ${ind} operators actually run, and ${company} is exactly the kind of business I want to understand.`);
  if (role) opts.push(`I would genuinely value your read as ${role} at ${company}.`);
  if (!opts.length) opts.push(`I have been reading about ${company} and would value your perspective.`);
  return opts[stableChoice(company + "|" + (role || ""), opts.length)];
}

export function render(template: string, c: Contact): string {
  const fn = firstName(c.contact_name);
  return template
    .split("{first_name}").join(fn)
    .split("{company}").join(c.company || "")
    .split("{role}").join(c.role || "")
    .split("{location}").join(c.location || "");
}

export function draft(c: Contact, v: Variant): { subject: string; body: string; personalization: string | null } {
  const subject = render(v.subject, c);
  let body = render(v.body, c);
  const line = personalizeLine(c);
  if (line) {
    const parts = body.split("\n\n");
    body = [parts[0], line, ...parts.slice(1)].join("\n\n");
  }
  return { subject, body, personalization: line };
}

export function tierRank(tier: string | null): number {
  if (tier) {
    const m = tier.match(/\d/);
    if (m) return parseInt(m[0], 10);
  }
  return 99;
}

// Priority: Warm before Cold, then Tier 1 < 2 < 3, then oldest-added first.
export function pickTargets(pool: Contact[], n: number): Contact[] {
  const sorted = [...pool].sort((a, b) => {
    const wa = (a.warm_cold || "").toLowerCase() === "warm" ? 0 : 1;
    const wb = (b.warm_cold || "").toLowerCase() === "warm" ? 0 : 1;
    if (wa !== wb) return wa - wb;
    const ta = tierRank(a.tier), tb = tierRank(b.tier);
    if (ta !== tb) return ta - tb;
    return (a.created_at || "").localeCompare(b.created_at || "");
  });
  return sorted.slice(0, n);
}

// Round-robin balanced by cumulative first-touch volume per variant.
export function assignVariants(
  targets: Contact[], variants: Variant[], counts: Record<string, number>,
): Array<[Contact, Variant]> {
  const c: Record<string, number> = { ...counts };
  const out: Array<[Contact, Variant]> = [];
  for (const t of targets) {
    let best = variants[0];
    for (const v of variants) {
      const cv = c[v.id] || 0, cb = c[best.id] || 0;
      if (cv < cb || (cv === cb && v.label < best.label)) best = v;
    }
    c[best.id] = (c[best.id] || 0) + 1;
    out.push([t, best]);
  }
  return out;
}

const SENT_STATES = new Set(["sent", "replied", "bounced", "no_response"]);

export type Metrics = {
  perVariant: Record<string, { sent: number; real: number }>;
  perIndustry: Record<string, { sent: number; real: number }>;
};

export function computeMetrics(
  outreach: Outreach[], replies: Reply[], variants: Variant[], contacts: Contact[],
): Metrics {
  const vlabel: Record<string, string> = {};
  variants.forEach((v) => (vlabel[v.id] = v.label));
  const realSet = new Set(replies.filter((r) => r.classification === "real_reply").map((r) => r.outreach_id));
  const cind: Record<string, string> = {};
  contacts.forEach((c) => (cind[c.id] = c.industry));
  const perVariant: Record<string, { sent: number; real: number }> = {};
  const perIndustry: Record<string, { sent: number; real: number }> = {};
  for (const o of outreach) {
    if (!o.is_first_touch || !SENT_STATES.has(o.status)) continue;
    const lab = vlabel[o.variant_id || ""] || "?";
    const ind = cind[o.contact_id] || "unknown";
    perVariant[lab] = perVariant[lab] || { sent: 0, real: 0 };
    perIndustry[ind] = perIndustry[ind] || { sent: 0, real: 0 };
    perVariant[lab].sent++;
    perIndustry[ind].sent++;
    if (realSet.has(o.id)) { perVariant[lab].real++; perIndustry[ind].real++; }
  }
  return { perVariant, perIndustry };
}
