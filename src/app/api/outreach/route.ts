import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAuthenticated } from "@/lib/requireAuth";
import { isValidEmail, normalizeEmail, nullableText } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/outreach
 *  - Admin (session cookie): returns ALL entries — the centralized database.
 *  - Public: requires ?email=… and returns only that submitter's sponsorship
 *    entries (each volunteer's personal dashboard on /sponsorship).
 */
export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();

  if (await isAuthenticated()) {
    const { data, error } = await supabase
      .from("outreach")
      .select("*")
      .eq("track", "sponsorship")
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ entries: data ?? [] });
  }

  const email = normalizeEmail(new URL(req.url).searchParams.get("email"));
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("outreach")
    .select("*")
    .eq("track", "sponsorship")
    .eq("submitter_email", email)
    .order("outreach_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json({ entries: data ?? [] });
}

/**
 * POST /api/outreach — PUBLIC: a volunteer logs someone they reached out to.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Honeypot — same trick as /api/join. Pretend success for bots.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true, entry: null });
  }

  const submitterName = String(body.submitter_name ?? "").trim();
  const submitterEmail = normalizeEmail(body.submitter_email);
  const company = String(body.company ?? "").trim();
  const contactName = String(body.contact_name ?? "").trim();
  const outreachDate = String(body.outreach_date ?? "").trim();

  if (!submitterName || !isValidEmail(submitterEmail)) {
    return NextResponse.json(
      { error: "Please tell us who you are (name + valid email) first." },
      { status: 400 }
    );
  }
  if (!company) {
    return NextResponse.json(
      { error: "Please enter the company." },
      { status: 400 }
    );
  }
  if (!contactName) {
    return NextResponse.json(
      { error: "Please enter the person's name." },
      { status: 400 }
    );
  }
  if (outreachDate && !DATE_RE.test(outreachDate)) {
    return NextResponse.json(
      { error: "Please enter the outreach date as YYYY-MM-DD." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("outreach")
    .insert({
      track: "sponsorship",
      submitter_name: submitterName,
      submitter_email: submitterEmail,
      company,
      contact_name: contactName,
      contact_title: nullableText(body.contact_title),
      harvard_affiliation: nullableText(body.harvard_affiliation),
      outreach_date: outreachDate || null,
      notes: nullableText(body.notes),
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, entry: data }, { status: 201 });
}
