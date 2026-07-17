import type { Volunteer } from "./types";

const COLUMNS: (keyof Volunteer)[] = [
  "name",
  "email",
  "whatsapp",
  "program",
  "logistics",
  "sponsorship",
  "vip_outreach",
  "longer_term_strategy",
  "recommended",
  "status",
  "source",
  "background",
  "notes",
  "created_at",
  "updated_at",
];

function escapeCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  // Neutralize spreadsheet formula injection: a leading =, +, -, @, tab, or CR
  // would make Excel/Sheets evaluate attacker-controlled input (the outreach
  // fields come from a public form). A leading apostrophe forces text.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  // Quote if it contains comma, quote, semicolon, or newline.
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string for the whole table. */
export function volunteersToCsv(rows: Volunteer[]): string {
  const header = COLUMNS.join(",");
  const lines = rows.map((row) =>
    COLUMNS.map((col) => escapeCell(row[col])).join(",")
  );
  return [header, ...lines].join("\r\n");
}

function triggerDownload(csv: string, filename: string): void {
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Trigger a CSV download of the volunteers table in the browser. */
export function downloadCsv(rows: Volunteer[], filename: string): void {
  triggerDownload(volunteersToCsv(rows), filename);
}

/** Generic CSV download for any table (used by the outreach tracker). */
export function downloadTableCsv(
  columns: string[],
  rows: Record<string, unknown>[],
  filename: string
): void {
  const header = columns.join(",");
  const lines = rows.map((row) =>
    columns.map((col) => escapeCell(row[col])).join(",")
  );
  triggerDownload([header, ...lines].join("\r\n"), filename);
}
