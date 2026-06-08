// ============================================================================
// Idempotent seed script — `npm run seed`
//
// Reads volunteers_seed.json from the project root and UPSERTS every row into
// the `volunteers` table, keyed on `email`. Re-running it is safe: existing
// rows (matched by email) are updated, new ones are inserted.
//
// Uses the SERVICE ROLE key (server-side only) so it bypasses Row Level
// Security. Zero runtime dependencies beyond @supabase/supabase-js — it parses
// .env.local itself so a non-engineer doesn't need any extra tooling.
// ============================================================================

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// --- Load env from .env.local then .env (without overwriting real env vars) ---
function loadEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return; // file may not exist — that's fine
  }
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(join(ROOT, ".env.local"));
loadEnvFile(join(ROOT, ".env"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "\n  ✗ Missing env vars. Make sure .env.local exists in the project root\n" +
      "    and contains NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\n"
  );
  process.exit(1);
}

// --- Normalise a value: trim strings, turn "" into null ---
function nullable(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

// --- Read and map the seed file (do NOT hardcode rows in this script) ---
const seedPath = join(ROOT, "volunteers_seed.json");
let seed;
try {
  seed = JSON.parse(readFileSync(seedPath, "utf8"));
} catch (err) {
  console.error(`\n  ✗ Could not read/parse ${seedPath}\n    ${err.message}\n`);
  process.exit(1);
}

if (!Array.isArray(seed)) {
  console.error("\n  ✗ volunteers_seed.json must be a JSON array.\n");
  process.exit(1);
}

const seenEmails = new Set();
const rows = [];

for (const [i, r] of seed.entries()) {
  const name = String(r?.name ?? "").trim();
  const email = String(r?.email ?? "")
    .trim()
    .toLowerCase();

  if (!name) {
    console.error(`  ✗ Row ${i} is missing a name.`);
    process.exit(1);
  }
  if (!email) {
    console.error(`  ✗ Row ${i} (${name}) is missing an email.`);
    process.exit(1);
  }
  if (seenEmails.has(email)) {
    console.error(`  ✗ Duplicate email in seed file: ${email}`);
    process.exit(1);
  }
  seenEmails.add(email);

  rows.push({
    name,
    email,
    whatsapp: nullable(r?.whatsapp),
    program: nullable(r?.program),
    logistics: Boolean(r?.logistics),
    sponsorship: Boolean(r?.sponsorship),
    vip_outreach: Boolean(r?.vip_outreach),
    longer_term_strategy: Boolean(r?.longer_term_strategy),
    background: nullable(r?.background),
    notes: nullable(r?.notes),
    recommended: Boolean(r?.recommended),
    source: r?.source === "self-signup" ? "self-signup" : "admin",
    status: r?.status === "new" ? "new" : "reviewed",
  });
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase
  .from("volunteers")
  .upsert(rows, { onConflict: "email" })
  .select("email");

if (error) {
  console.error(`\n  ✗ Seed failed: ${error.message}`);
  if (/relation .* does not exist/i.test(error.message)) {
    console.error(
      "    It looks like the table doesn't exist yet. Run the migration first\n" +
        "    (supabase/migrations/0001_init.sql) in the Supabase SQL Editor.\n"
    );
  }
  process.exit(1);
}

console.log(
  `\n  ✓ Seeded ${data?.length ?? rows.length} volunteers (upsert on email). Safe to re-run.\n`
);
