import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAuthenticated } from "@/lib/requireAuth";
import { isValidEmail, normalizeEmail, nullableText } from "@/lib/validate";
import type { OutreachEntry } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Authorization: an admin session may touch any entry; otherwise the caller
 * must prove ownership by supplying the submitter email that matches the row.
 */
async function loadIfAllowed(
  id: string,
  suppliedEmail: string
): Promise<{ row: OutreachEntry | null; admin: boolean; allowed: boolean }> {
  const admin = await isAuthenticated();
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("outreach")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const row = (data as OutreachEntry | null) ?? null;
  if (!row) return { row: null, admin, allowed: false };
  const allowed =
    admin ||
    (isValidEmail(suppliedEmail) && row.submitter_email === suppliedEmail);
  return { row, admin, allowed };
}

/** PATCH /api/outreach/:id — admin edits anything; a submitter edits their own. */
export async function PATCH(req: Request, { params }: Params) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const suppliedEmail = normalizeEmail(body.submitter_email);
  const { row, admin, allowed } = await loadIfAllowed(params.id, suppliedEmail);
  if (!row) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const patch: Record<string, unknown> = {};

  if ("company" in body) {
    const company = String(body.company ?? "").trim();
    if (!company) {
      return NextResponse.json(
        { error: "Company cannot be empty." },
        { status: 400 }
      );
    }
    patch.company = company;
  }
  if ("contact_name" in body) {
    const contactName = String(body.contact_name ?? "").trim();
    if (!contactName) {
      return NextResponse.json(
        { error: "Contact name cannot be empty." },
        { status: 400 }
      );
    }
    patch.contact_name = contactName;
  }
  if ("contact_title" in body) patch.contact_title = nullableText(body.contact_title);
  if ("harvard_affiliation" in body)
    patch.harvard_affiliation = nullableText(body.harvard_affiliation);
  if ("notes" in body) patch.notes = nullableText(body.notes);
  if ("outreach_date" in body) {
    const d = String(body.outreach_date ?? "").trim();
    if (d && !DATE_RE.test(d)) {
      return NextResponse.json(
        { error: "Outreach date must be YYYY-MM-DD." },
        { status: 400 }
      );
    }
    patch.outreach_date = d || null;
  }

  // Only admins may reassign an entry to a different submitter.
  if (admin && "new_submitter_name" in body) {
    const n = String(body.new_submitter_name ?? "").trim();
    if (n) patch.submitter_name = n;
  }
  if (admin && "new_submitter_email" in body) {
    const e = normalizeEmail(body.new_submitter_email);
    if (!isValidEmail(e)) {
      return NextResponse.json(
        { error: "A valid submitter email is required." },
        { status: 400 }
      );
    }
    patch.submitter_email = e;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No editable fields supplied." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("outreach")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entry: data });
}

/** DELETE /api/outreach/:id?email=… — admin deletes any; a submitter their own. */
export async function DELETE(req: Request, { params }: Params) {
  const suppliedEmail = normalizeEmail(
    new URL(req.url).searchParams.get("email")
  );
  const { row, allowed } = await loadIfAllowed(params.id, suppliedEmail);
  if (!row) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("outreach").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
