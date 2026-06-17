"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Login from "@/components/Login";
import Dashboard from "@/components/Dashboard";
import type { Session } from "@supabase/supabase-js";

export default function Page() {
  // undefined = still checking; null = logged out; Session = logged in
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <main className="center">
        <p className="muted">Loading…</p>
      </main>
    );
  }
  if (!session) return <Login />;
  return <Dashboard email={session.user.email || ""} />;
}
