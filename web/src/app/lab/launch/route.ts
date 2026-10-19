import type { NextRequest } from "next/server";
import { adminFromRequest } from "@/lib/admin-auth";
import { env } from "@/lib/env";
import { isSameOrigin, seeOther } from "@/lib/http";
import { isStaffRole } from "@/lib/session-service";
import { issueLabAssertion, labEntryUrl } from "@/lib/token-assertion";

// The CK Virtual Lab button posts here. POST, not GET, so a link on another site cannot mint a
// token for a signed-in visitor, and a prefetch never does.
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request" }, { status: 403 });
  const user = await adminFromRequest(req);
  if (!user) return seeOther(req, "/login");
  if (!isStaffRole(user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { LAB_URL, LAB_ASSERTION_SECRET } = env();
  if (!LAB_URL || !LAB_ASSERTION_SECRET) {
    return Response.json({ error: { code: "lab_unconfigured", message: "CK Virtual Lab is not configured" } }, { status: 503 });
  }
  const token = issueLabAssertion(user, LAB_ASSERTION_SECRET)!;
  return new Response(null, {
    status: 303,
    headers: { Location: labEntryUrl(LAB_URL, token), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
