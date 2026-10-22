import type { NextRequest } from "next/server";
import { adminFromRequest } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { isSameOrigin, seeOther } from "@/lib/http";
import { removeFromLab } from "@/lib/lab-removal";
import { canManageRoles, cleanSearch, createStaffRoles } from "@/lib/staff-roles";

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

const SAVED: Record<string, string> = {
  MEMBER: "cleared",
  STAFF: "staff",
  ADMIN: "admin",
};

// Sets MEMBER, STAFF or ADMIN. OWNER may assign all three; ADMIN may only assign MEMBER/STAFF.
// Losing staff access (to MEMBER) also removes the account from CK Virtual Lab.
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request" }, { status: 403 });
  const actor = await adminFromRequest(req);
  if (!actor) return seeOther(req, "/login");
  if (!canManageRoles(actor.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const role = form.get("role");
  const q = cleanSearch(typeof form.get("q") === "string" ? (form.get("q") as string) : undefined);
  if (typeof role !== "string") return seeOther(req, usersPath({ error: "invalid_role", q }));

  const roles = createStaffRoles(db());
  const result = await roles.setRole(actor, id, role);
  if (!result.ok) {
    if (result.error === "forbidden") return Response.json({ error: "Forbidden" }, { status: 403 });
    if (result.error === "not_found") return Response.json({ error: "Not found" }, { status: 404 });
    return seeOther(req, usersPath({ error: result.error, q }));
  }
  if (roles.lostLabAccess(result.previous, result.next) && (await removeFromLab(id)) === "failed") {
    return seeOther(req, usersPath({ error: "lab_unreached", id, q }));
  }
  return seeOther(req, usersPath({ saved: SAVED[result.next] ?? "staff", q }));
}
