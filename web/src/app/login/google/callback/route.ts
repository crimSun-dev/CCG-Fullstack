import type { NextRequest } from "next/server";
import { clearedOidcCookie, OIDC_COOKIE, sessionCookie } from "@/lib/admin-auth";
import { GOOGLE_CALLBACK_PATH } from "@/lib/google-oidc";
import { publicUrl, seeOther } from "@/lib/http";
import { LOGIN_FAILED, loginPage } from "@/lib/login-page";
import { googleOidc, sessionService } from "@/lib/services";
import { homeForRole } from "@/lib/session-service";

export async function GET(req: NextRequest) {
  const google = googleOidc();
  if (!google) return seeOther(req, "/login");

  const failed = () => {
    const res = loginPage(401, { googleAvailable: true, error: LOGIN_FAILED });
    res.headers.append("Set-Cookie", clearedOidcCookie());
    return res;
  };

  const [state, nonce] = (req.cookies.get(OIDC_COOKIE)?.value ?? "").split(".");
  const code = req.nextUrl.searchParams.get("code");
  if (!state || !nonce || !code || req.nextUrl.searchParams.get("state") !== state) return failed();

  const identity = await google.exchangeCode({
    code,
    redirectUri: publicUrl(req, GOOGLE_CALLBACK_PATH).toString(),
    nonce,
  });
  const result = identity ? await sessionService().loginWithGoogle(identity) : null;
  if (!result) return failed();

  const res = seeOther(req, homeForRole(result.user.role));
  res.headers.append("Set-Cookie", sessionCookie(result.token));
  res.headers.append("Set-Cookie", clearedOidcCookie());
  return res;
}
