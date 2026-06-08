import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAuthenticated } from "@/lib/requireAuth";
import {
  isValidEmail,
  normalizeEmail,
  nullableText,
  workstreamBooleans,
} from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/volunteers — full list for the dashboard (admin only). */
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("volunteers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ volunteers: data ?? [] });
}

/** POST /api/volunteers — add a volunteer manually (admin only). */
export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const email = normalizeEmail(body.email);
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "A valid email is required." },
      { status: 400 }
    );
  }

  const ws = workstreamBooleans(body);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("volunteers")
    .insert({
      name,
      email,
      whatsapp: nullableText(body.whatsapp),
      program: nullableText(body.program),
      background: nullableText(body.background),
      notes: nullableText(body.notes),
      recommended: body.recommended === true,
      logistics: ws.logistics,
      sponsorship: ws.sponsorship,
      vip_outreach: ws.vip_outreach,
      longer_term_strategy: ws.longer_term_strategy,
      source: "admin",
      status: "reviewed",
    })
    .select("*")
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "A volunteer with that email already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ volunteer: data }, { status: 201 });
}
