import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { oidcCookie } from "@/lib/admin-auth";
import { GOOGLE_CALLBACK_PATH } from "@/lib/google-oidc";
import { publicUrl, seeOther } from "@/lib/http";
import { googleOidc } from "@/lib/services";

// Starts the OpenID Connect round trip. `state` is the CSRF check on the callback, `nonce` ties
// the ID token to this browser. Both ride back in a short-lived HttpOnly cookie.
export async function GET(req: NextRequest) {
  const google = googleOidc();
  if (!google) return seeOther(req, "/login");

  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const location = google.authorizationUrl({
    redirectUri: publicUrl(req, GOOGLE_CALLBACK_PATH).toString(),
    state,
    nonce,
  });
  const res = new Response(null, { status: 303, headers: { Location: location } });
  res.headers.append("Set-Cookie", oidcCookie(`${state}.${nonce}`));
  return res;
}
