import type { NextRequest } from "next/server";
import { formText, guardSignedIn } from "@/lib/admin-mutation";
import { env } from "@/lib/env";
import { seeOther, siteOrigin } from "@/lib/http";
import { accountService } from "@/lib/services";

// Step one of an email change: a code goes to the new address. Nothing changes until it comes back.
export async function POST(req: NextRequest) {
  const gate = await guardSignedIn(req);
  if (gate instanceof Response) return gate;
  const email = formText(await req.formData(), "email") ?? "";
  const result = await accountService().requestEmailChange(gate.user.id, email, siteOrigin(req, env().PUBLIC_SITE_URL));
  return seeOther(req, result.ok ? "/account?saved=email-sent" : `/account?error=${result.error}`);
}
