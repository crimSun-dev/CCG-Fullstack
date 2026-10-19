import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { isSameOrigin, seeOther, siteOrigin } from "@/lib/http";
import { authPage, submitButton } from "@/lib/login-page";
import { accountService } from "@/lib/services";

// Step one of a reset: email a code. The answer never says whether the email has an account.

export function GET() {
  return authPage(200, {
    title: "Reset your password",
    heading: "Reset your password",
    body: `<form method="post" action="/forgot-password">
<p><label>Email <input name="email" type="email" required autocomplete="email"></label></p>
${submitButton("Email me a code")}
</form>
<p class="auth-links"><a href="/login">Back to sign in</a></p>`,
  });
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request" }, { status: 403 });
  const email = (await req.formData()).get("email");
  if (typeof email === "string" && email.trim()) {
    await accountService().requestPasswordReset(email, siteOrigin(req, env().PUBLIC_SITE_URL));
  }
  const to = typeof email === "string" ? `?email=${encodeURIComponent(email.trim())}&sent=1` : "?sent=1";
  return seeOther(req, `/reset-password${to}`);
}
