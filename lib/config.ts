// Public configuration. The Supabase URL and ANON key are designed to be public
// (safe to ship in the browser bundle). All data access is gated by Supabase Auth
// + Row-Level Security restricted to ALLOWED_EMAIL, so nothing here is sensitive.
// The secret service-role key is never used by this web app.

export const SUPABASE_URL = "https://zvotevxrebkqjncuyjlw.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2b3RldnhyZWJrcWpuY3V5amx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3Mzc5MTcsImV4cCI6MjA5NzMxMzkxN30.reb11XoWYXV4qJT_N-V9tM9QIYecqbbQVlyp0zB_fsI";

export const ALLOWED_EMAIL = "adham@vound.ai";
export const OUTREACH_SENDER = "adham@vound.ai";
export const DAILY_SEND_CAP = 20;
export const TARGET_SOURCE = "HBS";
