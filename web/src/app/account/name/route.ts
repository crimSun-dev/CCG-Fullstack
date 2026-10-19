import type { NextRequest } from "next/server";
import { formText, guardSignedIn } from "@/lib/admin-mutation";
import { seeOther } from "@/lib/http";
import { accountService } from "@/lib/services";

export async function POST(req: NextRequest) {
  const gate = await guardSignedIn(req);
  if (gate instanceof Response) return gate;
  const result = await accountService().updateName(gate.user.id, formText(await req.formData(), "name") ?? "");
  return seeOther(req, result.ok ? "/account?saved=name" : `/account?error=${result.error}`);
}
