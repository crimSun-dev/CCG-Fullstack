import type { NextRequest } from "next/server";
import { adminFromRequest } from "@/lib/admin-auth";
import { env, labTarget } from "@/lib/env";
import { avatarPath } from "@/lib/avatar";
import { isSameOrigin, publicUrl, seeOther } from "@/lib/http";
import { avatarStore } from "@/lib/services";
import { isStaffRole } from "@/lib/session-service";
import { issueLabAssertion, labEntryUrl } from "@/lib/token-assertion";

// The CK Virtual Lab button posts here. POST, not GET, so a link on another site cannot mint a
// token for a signed-in visitor, and a prefetch never does.
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request" }, { status: 403 });
  const user = await adminFromRequest(req);
  if (!user) return seeOther(req, "/login");
  if (!isStaffRole(user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const e = env();
  const target = labTarget(e);
  if (!target) return seeOther(req, "/admin?error=lab");
  // Served here (LAB_DATABASE_URL), the lab is this site's own /lab.
  const labUrl = target === "external" ? e.LAB_URL! : publicUrl(req, "/lab").toString();
  // The picture's address as the lab's visitors will load it: absolute, since the lab may live on LAB_URL.
  const pictured = await avatarStore().version(user.id);
  const avatar = pictured ? new URL(avatarPath(user.id, pictured), e.PUBLIC_SITE_URL ?? publicUrl(req, "/")).toString() : null;
  const token = issueLabAssertion(user, e.LAB_ASSERTION_SECRET!, Date.now(), avatar)!;
  return new Response(null, {
    status: 303,
    headers: { Location: labEntryUrl(labUrl, token), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
