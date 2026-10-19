import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { sessionService } from "./services";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, type AdminUser } from "./session-service";

// Secure in production. Browsers treat http://localhost as secure, but curl and some test
// clients do not, so dev drops the flag.
const secure = process.env.NODE_ENV === "production";

function serialize(name: string, value: string, maxAge: number, path = "/"): string {
  const parts = [`${name}=${value}`, `Path=${path}`, "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export const sessionCookie = (token: string) => serialize(SESSION_COOKIE, token, SESSION_TTL_SECONDS);
export const clearedSessionCookie = () => serialize(SESSION_COOKIE, "", 0);

// CSRF state and nonce for one Google round trip. Scoped to the Google routes, gone in 10 minutes.
// SameSite=Lax still sends it on Google's top-level redirect back to the callback.
export const OIDC_COOKIE = "ccg_oidc";
const OIDC_PATH = "/login/google";
export const oidcCookie = (value: string) => serialize(OIDC_COOKIE, value, 600, OIDC_PATH);
export const clearedOidcCookie = () => serialize(OIDC_COOKIE, "", 0, OIDC_PATH);

// Checked on every admin request. A stale or revoked cookie yields null.
export async function currentAdmin(): Promise<AdminUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sessionService().read(token) : null;
}

export async function adminFromRequest(req: NextRequest): Promise<AdminUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return token ? sessionService().read(token) : null;
}
