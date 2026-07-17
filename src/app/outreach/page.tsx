import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { OutreachEntry } from "@/lib/types";
import { OutreachAdmin } from "@/components/OutreachAdmin";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  let entries: OutreachEntry[] = [];
  let loadError: string | null = null;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("outreach")
      .select("*")
      .eq("track", "sponsorship")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    entries = (data as OutreachEntry[]) ?? [];
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load outreach.";
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-20">
        <h1 className="text-lg font-semibold text-ink">
          Couldn&apos;t load the outreach tracker
        </h1>
        <p className="mt-3 text-sm text-muted">
          The app is running, but it couldn&apos;t reach the database. If you
          haven&apos;t yet, run migration{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 text-sand">
            supabase/migrations/0002_outreach.sql
          </code>{" "}
          in the Supabase SQL Editor.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface p-4 text-xs text-crimson">
          {loadError}
        </pre>
      </main>
    );
  }

  return <OutreachAdmin initial={entries} />;
}
