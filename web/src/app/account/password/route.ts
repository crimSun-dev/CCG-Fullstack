import type { NextRequest } from "next/server";
import { guardSignedIn } from "@/lib/admin-mutation";
import { seeOther } from "@/lib/http";
import { accountService } from "@/lib/services";

// Passwords are not trimmed: a leading or trailing space is part of the password.
export async function POST(req: NextRequest) {
  const gate = await guardSignedIn(req);
  if (gate instanceof Response) return gate;
  const form = await req.formData();
  const raw = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" ? v : "";
  };
  const result = await accountService().changePassword(gate.user.id, {
    current: raw("current"),
    next: raw("next"),
    keepTokenHash: gate.tokenHash,
  });
  return seeOther(req, result.ok ? "/account?saved=password" : `/account?error=${result.error}`);
}
