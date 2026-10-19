import type { NextRequest } from "next/server";
import { isSameOrigin, seeOther } from "@/lib/http";
import { authPage, escapeHtml, submitButton } from "@/lib/login-page";
import { accountService } from "@/lib/services";
import { PASSWORD_MIN } from "@/lib/session-service";

// Step two of a reset: the emailed code plus a new password. A spent code never works twice.

const SENT = "If that email has an account, a 6-digit code is on its way. It expires in 15 minutes.";

function resetPage(status: number, opts: { email?: string; error?: string; notice?: string } = {}): Response {
  return authPage(status, {
    title: "Set a new password",
    heading: "Set a new password",
    error: opts.error,
    notice: opts.notice,
    body: `<form method="post" action="/reset-password">
<p><label>Email <input name="email" type="email" required autocomplete="username" value="${escapeHtml(opts.email ?? "")}"></label></p>
<p><label>Code from the email <input name="code" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"></label></p>
<p><label>New password <input name="password" type="password" required minlength="${PASSWORD_MIN}" autocomplete="new-password"><span class="auth-hint">At least ${PASSWORD_MIN} characters.</span></label></p>
${submitButton("Set password")}
</form>
<p class="auth-links"><a href="/forgot-password">Send a new code</a> · <a href="/login">Back to sign in</a></p>`,
  });
}

export function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  return resetPage(200, { email: params.get("email") ?? "", notice: params.get("sent") ? SENT : undefined });
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request" }, { status: 403 });
  const form = await req.formData();
  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" ? v : "";
  };
  const email = text("email");
  const result = await accountService().resetPassword({ email, code: text("code"), password: text("password") });
  if (!result.ok) return resetPage(400, { email, error: result.message });
  return seeOther(req, "/login?reset=1");
}
