import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { WORKSTREAMS } from "@/lib/constants";
import {
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  nullableText,
  workstreamBooleans,
} from "@/lib/validate";

export const runtime = "nodejs";

/**
 * PUBLIC endpoint — the WhatsApp sign-up form posts here.
 *
 * Upsert semantics keyed on lowercased email:
 *   - New email  -> INSERT, source = 'self-signup', status = 'new'.
 *   - Existing   -> UPDATE name, whatsapp, program, the four workstreams,
 *                   background; set status = 'new'. PRESERVE notes,
 *                   recommended, and source. updated_at is bumped by trigger.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Honeypot: real users never fill a hidden field. Pretend success for bots.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true, name: "", workstreams: [] });
  }

  const name = String(body.name ?? "").trim();
  const email = normalizeEmail(body.email);
  const whatsapp = String(body.whatsapp ?? "").trim();
  const program = nullableText(body.program);
  const background = nullableText(body.background);
  const ws = workstreamBooleans(body);

  if (!name) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }
  if (!whatsapp || !isValidPhone(whatsapp)) {
    return NextResponse.json(
      { error: "Please enter a valid WhatsApp number." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Decide insert vs update so we never clobber admin-only fields on existing rows.
  const { data: existing, error: selectError } = await supabase
    .from("volunteers")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (selectError) {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }

  const editable = {
    name,
    whatsapp,
    program,
    background,
    logistics: ws.logistics,
    sponsorship: ws.sponsorship,
    vip_outreach: ws.vip_outreach,
    longer_term_strategy: ws.longer_term_strategy,
    status: "new" as const,
  };

  if (existing) {
    const { error } = await supabase
      .from("volunteers")
      .update(editable)
      .eq("id", existing.id);
    if (error) {
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }
  } else {
    const { error } = await supabase
      .from("volunteers")
      .insert({ email, source: "self-signup", ...editable });

    // Handle a rare race where the row was created between SELECT and INSERT.
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        const { error: updErr } = await supabase
          .from("volunteers")
          .update(editable)
          .eq("email", email);
        if (updErr) {
          return NextResponse.json(
            { error: "Something went wrong. Please try again." },
            { status: 500 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Something went wrong. Please try again." },
          { status: 500 }
        );
      }
    }
  }

  const selectedLabels = WORKSTREAMS.filter((w) => ws[w.key]).map(
    (w) => w.label
  );

  return NextResponse.json({ ok: true, name, workstreams: selectedLabels });
}
