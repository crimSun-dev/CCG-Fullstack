import type { NextRequest } from "next/server";
import { adminFromRequest } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { isSameOrigin, seeOther } from "@/lib/http";
import { removeFromLab } from "@/lib/lab-removal";
import { cleanSearch, createStaffRoles } from "@/lib/staff-roles";

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function usersPath(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `/admin/users?${qs}` : "/admin/users";
}

// Sets or clears STAFF on one account. ADMIN only; the service enforces the rest. Clearing also removes
// the account from CK Virtual Lab; if the lab is not reached, the page offers to send it again.
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request" }, { status: 403 });
  const actor = await adminFromRequest(req);
  if (!actor) return seeOther(req, "/login");
  if (actor.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const staff = form.get("staff") === "true";
  const q = cleanSearch(typeof form.get("q") === "string" ? (form.get("q") as string) : undefined);
  const result = await createStaffRoles(db()).setStaff(actor, id, staff);
  if (!result.ok) {
    if (result.error === "forbidden") return Response.json({ error: "Forbidden" }, { status: 403 });
    if (result.error === "not_found") return Response.json({ error: "Not found" }, { status: 404 });
    return seeOther(req, usersPath({ error: result.error, q }));
  }
  if (!staff && (await removeFromLab(id)) === "failed") {
    return seeOther(req, usersPath({ error: "lab_unreached", id, q }));
  }
  return seeOther(req, usersPath({ saved: staff ? "granted" : "cleared", q }));
}
