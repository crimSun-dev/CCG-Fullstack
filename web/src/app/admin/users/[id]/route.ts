import type { NextRequest } from "next/server";
import { adminFromRequest } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { isSameOrigin, seeOther } from "@/lib/http";
import { removeFromLab } from "@/lib/lab-removal";
import { createStaffRoles } from "@/lib/staff-roles";

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sets or clears STAFF on one account. ADMIN only; the service enforces the rest. Clearing also removes
// the account from CK Virtual Lab; if the lab is not reached, the page offers to send it again.
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request" }, { status: 403 });
  const actor = await adminFromRequest(req);
  if (!actor) return seeOther(req, "/login");
  if (actor.role !== "ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });

  const staff = (await req.formData()).get("staff") === "true";
  const result = await createStaffRoles(db()).setStaff(actor, id, staff);
  if (!result.ok) {
    if (result.error === "forbidden") return Response.json({ error: "Forbidden" }, { status: 403 });
    if (result.error === "not_found") return Response.json({ error: "Not found" }, { status: 404 });
    return seeOther(req, `/admin/users?error=${result.error}`);
  }
  if (!staff && (await removeFromLab(id)) === "failed") return seeOther(req, `/admin/users?error=lab_unreached&id=${id}`);
  return seeOther(req, `/admin/users?saved=${staff ? "granted" : "cleared"}`);
}
