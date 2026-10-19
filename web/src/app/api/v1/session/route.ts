import type { NextRequest } from "next/server";
import { adminFromRequest } from "@/lib/admin-auth";

// Whether the visitor is signed in, so the nav can offer "Your account" instead of "Sign in".
// Asked from the browser so the public pages stay static and cached; this answer is never cached.
export async function GET(req: NextRequest) {
  const signedIn = (await adminFromRequest(req)) !== null;
  return Response.json({ signedIn }, { headers: { "Cache-Control": "no-store, private" } });
}
