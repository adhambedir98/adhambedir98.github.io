/**
 * Tiny, dependency-free session auth for the admin gate.
 *
 * - A single shared ADMIN_PASSWORD (env var) protects the dashboard.
 * - On success we set an httpOnly cookie holding a signed token:
 *       base64url(payload) + "." + base64url(HMAC-SHA256(payload))
 *   where the HMAC key is derived from ADMIN_PASSWORD. No extra secret needed.
 * - Everything uses the Web Crypto API + btoa/atob, which exist in BOTH the
 *   Edge runtime (middleware) and the Node runtime (route handlers), so the
 *   same code verifies the cookie in both places.
 */

export const SESSION_COOKIE = "davos_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function adminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error("ADMIN_PASSWORD is not set.");
  return pw;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToB64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stringToB64url(str: string): string {
  return bytesToB64url(encoder.encode(str));
}

function b64urlToString(b64url: string): string {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return decoder.decode(bytes);
}

async function hmacSign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(adminPassword()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return bytesToB64url(new Uint8Array(sig));
}

/** Constant-time-ish string comparison (avoids early-exit on content). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

/** True if the supplied password matches ADMIN_PASSWORD. */
export function checkPassword(input: string): boolean {
  const pw = process.env.ADMIN_PASSWORD ?? "";
  return pw.length > 0 && safeEqual(input, pw);
}

/** Create a signed session token valid for SESSION_MAX_AGE_SECONDS. */
export async function createSessionToken(): Promise<string> {
  const payload = stringToB64url(
    JSON.stringify({ exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 })
  );
  const sig = await hmacSign(payload);
  return `${payload}.${sig}`;
}

/** Verify a session token's signature and expiry. */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;

  let expectedSig: string;
  try {
    expectedSig = await hmacSign(payload);
  } catch {
    return false;
  }
  if (!safeEqual(sig, expectedSig)) return false;

  try {
    const data = JSON.parse(b64urlToString(payload));
    if (typeof data.exp !== "number") return false;
    return Date.now() < data.exp;
  } catch {
    return false;
  }
}
