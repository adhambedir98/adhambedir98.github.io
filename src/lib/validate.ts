import { WORKSTREAM_KEYS } from "./constants";
import type { WorkstreamKey } from "./types";

// Pragmatic email check — not RFC-perfect, but rejects obvious junk.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

/** A WhatsApp number is "valid enough" if it has at least 7 digits. */
export function isValidPhone(value: string): boolean {
  return value.replace(/\D/g, "").length >= 7;
}

/** Trim a string; return null for empty so nullable columns stay null. */
export function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

export function asBool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

export function workstreamBooleans(
  src: Record<string, unknown>
): Record<WorkstreamKey, boolean> {
  const out = {} as Record<WorkstreamKey, boolean>;
  for (const key of WORKSTREAM_KEYS) out[key] = asBool(src[key]);
  return out;
}
