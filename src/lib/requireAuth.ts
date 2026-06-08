import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./auth";

/**
 * Server-side auth check for Route Handlers and Server Components.
 *
 * The middleware already gates admin routes, but we re-check here as
 * defense-in-depth so no admin endpoint trusts the request blindly.
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}
