import type { NextRequest } from "next/server";
import { adminFromRequest } from "./admin-auth";
import { isSameOrigin, seeOther } from "./http";
import type { AdminRole, AdminUser } from "./session-service";

// Both roles may edit program summaries, bios, and the nullable role field (TDD Section 3).
const CAN_EDIT_CONTENT: readonly AdminRole[] = ["ADMIN", "EDITOR"];

// Shared guard for admin form posts: same origin, live session, allowed role.
// Returns the user, or the response to send instead.
export async function guardContentEdit(req: NextRequest): Promise<AdminUser | Response> {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request" }, { status: 403 });
  const admin = await adminFromRequest(req);
  if (!admin) return seeOther(req, "/login");
  if (!CAN_EDIT_CONTENT.includes(admin.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
  return admin;
}

export function formText(form: FormData, key: string): string | null {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : null;
}
