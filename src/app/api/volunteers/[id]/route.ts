import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAuthenticated } from "@/lib/requireAuth";
import { isValidEmail, normalizeEmail, nullableText } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** PATCH /api/volunteers/:id — inline edits from the dashboard (admin only). */
export async function PATCH(req: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  // Booleans
  for (const key of [
    "logistics",
    "sponsorship",
    "vip_outreach",
    "longer_term_strategy",
    "recommended",
  ] as const) {
    if (key in body) patch[key] = body[key] === true;
  }

  // Free-text / nullable
  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "Name cannot be empty." },
        { status: 400 }
      );
    }
    patch.name = name;
  }
  if ("email" in body) {
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "A valid email is required." },
        { status: 400 }
      );
    }
    patch.email = email;
  }
  if ("whatsapp" in body) patch.whatsapp = nullableText(body.whatsapp);
  if ("program" in body) patch.program = nullableText(body.program);
  if ("background" in body) patch.background = nullableText(body.background);
  if ("notes" in body) patch.notes = nullableText(body.notes);

  // Enumerated status
  if ("status" in body) {
    const status = String(body.status);
    if (status !== "new" && status !== "reviewed") {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    patch.status = status;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No editable fields supplied." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("volunteers")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "That email is already used by another volunteer." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ volunteer: data });
}

/** DELETE /api/volunteers/:id — remove a volunteer (admin only). */
export async function DELETE(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("volunteers")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
