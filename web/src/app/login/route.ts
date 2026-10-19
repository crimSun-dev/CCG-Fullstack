import type { NextRequest } from "next/server";
import { adminFromRequest, sessionCookie } from "@/lib/admin-auth";
import { isSameOrigin, seeOther } from "@/lib/http";
import { LOGIN_FAILED, loginPage } from "@/lib/login-page";
import { googleOidc, sessionService } from "@/lib/services";
import { homeForRole } from "@/lib/session-service";

// Visitor sign-in. A general user lands on /account. ADMIN and EDITOR, granted only by
// `pnpm admin:create`, land on the staff page.

export async function GET(req: NextRequest) {
  const user = await adminFromRequest(req);
  if (user) return seeOther(req, homeForRole(user.role));
  return loginPage(200, { googleAvailable: googleOidc() !== null });
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request" }, { status: 403 });
  const failed = () => loginPage(401, { googleAvailable: googleOidc() !== null, error: LOGIN_FAILED });

  const form = await req.formData();
  const email = form.get("email");
  const password = form.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return failed();
  }

  const result = await sessionService().login(email, password);
  if (!result) return failed();

  const res = seeOther(req, homeForRole(result.user.role));
  res.headers.append("Set-Cookie", sessionCookie(result.token));
  return res;
}
