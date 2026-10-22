import type { PrismaClient } from "@/generated/prisma/client";
import { isOwnerEmail, isStaffRole, type AdminUser } from "./session-service";

// Role grants at /admin/users.
// OWNER may set MEMBER, STAFF or ADMIN on other accounts (ADMIN is staff automatically).
// ADMIN may only move MEMBER <-> STAFF, never touch ADMIN, OWNER or EDITOR.
// Nobody may change their own role, and nobody may change the owner mailbox.

export type AccountRow = { id: string; email: string; name: string; role: string; googleLinked: boolean };

// Roles an OWNER or ADMIN may assign from the accounts page.
export type AssignableRole = "MEMBER" | "STAFF" | "ADMIN";

export type SetRoleResult =
  | { ok: true; previous: string; next: AssignableRole }
  | { ok: false; error: "forbidden" | "self" | "not_found" | "fixed_role" | "owner_protected" | "invalid_role" };

export function canManageRoles(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canManageAdmins(role: string): boolean {
  return role === "OWNER";
}

export const SEARCH_MAX = 120;

// Narrows the accounts list by name or email. Empty / whitespace means every account.
export function cleanSearch(q: string | null | undefined): string | undefined {
  if (typeof q !== "string") return undefined;
  const trimmed = q.trim().slice(0, SEARCH_MAX);
  return trimmed || undefined;
}

function isAssignable(role: string): role is AssignableRole {
  return role === "MEMBER" || role === "STAFF" || role === "ADMIN";
}

function isProtectedTarget(target: { email: string; role: string }): boolean {
  return target.role === "OWNER" || isOwnerEmail(target.email);
}

export function createStaffRoles(prisma: PrismaClient) {
  return {
    async list(q?: string | null): Promise<AccountRow[]> {
      const search = cleanSearch(q);
      const rows = await prisma.adminUser.findMany({
        where: search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
              ],
            }
          : undefined,
        orderBy: [{ role: "asc" }, { email: "asc" }],
        select: { id: true, email: true, name: true, role: true, googleSub: true },
      });
      return rows.map(({ googleSub, ...r }) => ({ ...r, googleLinked: googleSub !== null }));
    },

    async setRole(actor: AdminUser, targetId: string, next: string): Promise<SetRoleResult> {
      if (!canManageRoles(actor.role)) return { ok: false, error: "forbidden" };
      if (!isAssignable(next)) return { ok: false, error: "invalid_role" };
      if (actor.id === targetId) return { ok: false, error: "self" };

      const target = await prisma.adminUser.findUnique({ where: { id: targetId } });
      if (!target) return { ok: false, error: "not_found" };
      if (isProtectedTarget(target)) return { ok: false, error: "owner_protected" };
      if (target.role === "EDITOR") return { ok: false, error: "fixed_role" };

      if (actor.role === "ADMIN") {
        // ADMIN may only grant or clear STAFF on MEMBER/STAFF rows.
        if (next === "ADMIN") return { ok: false, error: "forbidden" };
        if (target.role !== "MEMBER" && target.role !== "STAFF") return { ok: false, error: "fixed_role" };
      } else if (actor.role === "OWNER") {
        // OWNER may set MEMBER, STAFF or ADMIN on those same ranks; never EDITOR/OWNER.
        if (target.role !== "MEMBER" && target.role !== "STAFF" && target.role !== "ADMIN") {
          return { ok: false, error: "fixed_role" };
        }
      } else {
        return { ok: false, error: "forbidden" };
      }

      if (target.role === next) return { ok: true, previous: target.role, next };

      const { count } = await prisma.adminUser.updateMany({
        where: {
          id: targetId,
          role: { in: actor.role === "OWNER" ? ["MEMBER", "STAFF", "ADMIN"] : ["MEMBER", "STAFF"] },
        },
        data: { role: next },
      });
      if (count !== 1) return { ok: false, error: "fixed_role" };
      return { ok: true, previous: target.role, next };
    },

    // True when the account just lost lab access (was staff-capable, now MEMBER).
    lostLabAccess(previous: string, next: AssignableRole): boolean {
      return isStaffRole(previous) && !isStaffRole(next);
    },
  };
}