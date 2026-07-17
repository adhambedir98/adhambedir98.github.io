export type WorkstreamKey =
  | "logistics"
  | "sponsorship"
  | "vip_outreach"
  | "longer_term_strategy";

export type Source = "admin" | "self-signup";
export type Status = "new" | "reviewed";

export interface Volunteer {
  id: string;
  name: string;
  email: string;
  whatsapp: string | null;
  program: string | null;
  logistics: boolean;
  sponsorship: boolean;
  vip_outreach: boolean;
  longer_term_strategy: boolean;
  background: string | null;
  notes: string | null;
  recommended: boolean;
  source: Source;
  status: Status;
  created_at: string;
  updated_at: string;
}

export type OutreachTrack = "sponsorship" | "vip_outreach";

export interface OutreachEntry {
  id: string;
  track: OutreachTrack;
  submitter_name: string;
  submitter_email: string;
  company: string;
  contact_name: string;
  contact_title: string | null;
  harvard_affiliation: string | null;
  outreach_date: string | null; // YYYY-MM-DD
  notes: string | null;
  created_at: string;
  updated_at: string;
}
