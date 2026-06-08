import type { WorkstreamKey } from "./types";

export interface Workstream {
  key: WorkstreamKey;
  label: string;
  short: string;
  description: string;
}

/**
 * The four fixed workstreams. Used everywhere: the public form, the dashboard
 * counts, the per-workstream email export, and CSV columns.
 */
export const WORKSTREAMS: readonly Workstream[] = [
  {
    key: "logistics",
    label: "Logistics",
    short: "Logistics",
    description:
      "Ensure a seamless event on the ground: venue, timing, and media partnerships (e.g. Bloomberg, CNBC).",
  },
  {
    key: "sponsorship",
    label: "Sponsorship",
    short: "Sponsorship",
    description:
      "Help secure sponsors ($50K–$1M+) across industries and geographies.",
  },
  {
    key: "vip_outreach",
    label: "VIP Outreach",
    short: "VIP Outreach",
    description:
      "Engage prominent Harvard alumni and arrange for them to attend the reception or speak on Harvard panels during the week.",
  },
  {
    key: "longer_term_strategy",
    label: "Longer-Term Strategy",
    short: "Strategy",
    description:
      "Capture learnings and formalize relationships to scale this model to future WEFs and other events (Milken, Aspen, TED, etc.).",
  },
] as const;

export const WORKSTREAM_KEYS: readonly WorkstreamKey[] = WORKSTREAMS.map(
  (w) => w.key
);

/** Options for the public sign-up form's program / affiliation dropdown. */
export const PROGRAM_OPTIONS: readonly string[] = [
  "HBS MBA 2027",
  "HBS MBA 2026",
  "HKS",
  "Other Harvard",
  "Alum",
  "Other",
] as const;

export const APP_TITLE = "Davos 2027 — Harvard Reception Volunteers";
