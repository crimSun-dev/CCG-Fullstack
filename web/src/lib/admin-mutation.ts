import type { NextRequest } from "next/server";
import { adminFromRequest } from "./admin-auth";
import { isSameOrigin, seeOther } from "./http";
import { hashToken, SESSION_COOKIE, type AdminRole, type AdminUser } from "./session-service";

// OWNER, ADMIN and EDITOR may edit program summaries, bios, and the nullable role field.
const CAN_EDIT_CONTENT: readonly AdminRole[] = ["OWNER", "ADMIN", "EDITOR"];

export function canEditContent(role: string): boolean {
  return (CAN_EDIT_CONTENT as readonly string[]).includes(role);
}

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

// Guard for a signed-in account's own form posts (/account/*): same origin and a live session,
// any role. Returns the user with its session token hash, or the response to send instead.
export async function guardSignedIn(req: NextRequest): Promise<{ user: AdminUser; tokenHash: string } | Response> {
  if (!isSameOrigin(req)) return Response.json({ error: "Cross-origin request" }, { status: 403 });
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await adminFromRequest(req) : null;
  if (!user || !token) return seeOther(req, "/login");
  return { user, tokenHash: hashToken(token) };
}
