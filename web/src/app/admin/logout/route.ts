import type { NextRequest } from "next/server";
import { isSameOrigin, seeOther } from "@/lib/http";
import { clearedSessionCookie } from "@/lib/admin-auth";
import { sessionService } from "@/lib/services";
import { SESSION_COOKIE } from "@/lib/session-service";

// Logout sets revoked_at on the row, so an old copy of the cookie stops working too.
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request" }, { status: 403 });

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await sessionService().revoke(token);

  const res = seeOther(req, "/login");
  res.headers.append("Set-Cookie", clearedSessionCookie());
  return res;
}
