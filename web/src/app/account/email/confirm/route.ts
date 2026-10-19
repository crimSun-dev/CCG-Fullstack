import type { NextRequest } from "next/server";
import { formText, guardSignedIn } from "@/lib/admin-mutation";
import { env } from "@/lib/env";
import { seeOther, siteOrigin } from "@/lib/http";
import { accountService } from "@/lib/services";

// Step two: the code from the new inbox. The old address is told about the change.
export async function POST(req: NextRequest) {
  const gate = await guardSignedIn(req);
  if (gate instanceof Response) return gate;
  const code = formText(await req.formData(), "code") ?? "";
  const result = await accountService().confirmEmailChange(gate.user.id, code, siteOrigin(req, env().PUBLIC_SITE_URL));
  return seeOther(req, result.ok ? "/account?saved=email" : `/account?error=${result.error}`);
}
