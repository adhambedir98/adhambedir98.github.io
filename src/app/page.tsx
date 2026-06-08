import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Volunteer } from "@/lib/types";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let volunteers: Volunteer[] = [];
  let loadError: string | null = null;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("volunteers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    volunteers = (data as Volunteer[]) ?? [];
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load volunteers.";
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-20">
        <h1 className="text-lg font-semibold text-ink">
          Couldn&apos;t load the tracker
        </h1>
        <p className="mt-3 text-sm text-muted">
          The app is running, but it couldn&apos;t reach the database. Check that
          your environment variables are set and that the migration has been run.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface p-4 text-xs text-crimson">
          {loadError}
        </pre>
      </main>
    );
  }

  return <Dashboard initial={volunteers} />;
}
