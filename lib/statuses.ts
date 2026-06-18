// Status vocabulary + color scheme.
// Greens = engaged/positive, yellows = pending action, reds = dead/failed.

export const STATUS_LABEL: Record<string, string> = {
  to_research: "To research",
  to_contact: "To contact",
  contacted: "Contacted",
  replied: "Replied",
  call_booked: "Call booked",
  not_interested: "Not interested",
  bounced: "Bounced",
  no_response: "No response",
};

export const STATUS_COLOR: Record<string, string> = {
  to_research: "#d9a514",   // amber
  to_contact: "#e3c000",    // yellow
  contacted: "#3fb950",     // green
  replied: "#2ea043",       // green
  call_booked: "#2ea043",   // green
  not_interested: "#8b949e", // gray (dead but not an error)
  bounced: "#f85149",       // red
  no_response: "#f85149",   // red
};

export const STATUS_OPTIONS = Object.keys(STATUS_LABEL);

export function statusColor(s: string): string {
  return STATUS_COLOR[s] || "#9a9a9a";
}
export function statusLabel(s: string): string {
  return STATUS_LABEL[s] || s;
}
