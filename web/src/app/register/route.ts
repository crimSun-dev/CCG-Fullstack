import type { NextRequest } from "next/server";
import { adminFromRequest, sessionCookie } from "@/lib/admin-auth";
import { isSameOrigin, seeOther } from "@/lib/http";
import { authPage, escapeHtml, submitButton } from "@/lib/login-page";
import { sessionService } from "@/lib/services";
import { homeForRole, PASSWORD_MIN } from "@/lib/session-service";

// Public sign-up. Every new account is MEMBER; STAFF comes from an ADMIN at /admin/users.

function registerPage(status: number, opts: { error?: string; email?: string; name?: string } = {}): Response {
  return authPage(status, {
    title: "Create an account",
    heading: "Create an account",
    error: opts.error,
    body: `<form method="post" action="/register">
<p><label>Full name <input name="name" required maxlength="120" autocomplete="name" value="${escapeHtml(opts.name ?? "")}"></label></p>
<p><label>Email <input name="email" type="email" required autocomplete="email" value="${escapeHtml(opts.email ?? "")}"></label></p>
<p><label>Password <input name="password" type="password" required minlength="${PASSWORD_MIN}" autocomplete="new-password"><span class="auth-hint">At least ${PASSWORD_MIN} characters.</span></label></p>
${submitButton("Create account")}
</form>
<p class="auth-links">Already registered? <a href="/login">Sign in</a></p>`,
  });
}

export async function GET(req: NextRequest) {
  const user = await adminFromRequest(req);
  if (user) return seeOther(req, homeForRole(user.role));
  return registerPage(200);
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request" }, { status: 403 });
  const form = await req.formData();
  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" ? v : "";
  };
  const input = { email: text("email"), password: text("password"), name: text("name") };

  const result = await sessionService().register(input);
  if (!result.ok) {
    const status = result.error === "email_taken" ? 409 : 400;
    return registerPage(status, { error: result.message, email: input.email, name: input.name });
  }

  const res = seeOther(req, homeForRole(result.user.role));
  res.headers.append("Set-Cookie", sessionCookie(result.token));
  return res;
}
