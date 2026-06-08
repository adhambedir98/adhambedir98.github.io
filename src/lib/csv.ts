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
  const s = value === null || value === undefined ? "" : String(value);
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

/** Trigger a CSV download in the browser. */
export function downloadCsv(rows: Volunteer[], filename: string): void {
  const csv = volunteersToCsv(rows);
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
