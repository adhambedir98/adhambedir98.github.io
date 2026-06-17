import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

// Single browser client. The session (JWT) is persisted in localStorage and
// auto-refreshed; every query runs as the logged-in user, so RLS enforces access.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
