import type { PrismaClient } from "@/generated/prisma/client";
import type { AdminUser } from "./session-service";

// The STAFF grant. Only an ADMIN uses it, never on itself, and it only moves an account between
// MEMBER and STAFF: ADMIN and EDITOR stay with `pnpm admin:create`, so no admin demotes another here.

export type AccountRow = { id: string; email: string; name: string; role: string; googleLinked: boolean };

export type SetStaffResult = { ok: true } | { ok: false; error: "forbidden" | "self" | "not_found" | "fixed_role" };

export function canManageRoles(role: string): boolean {
  return role === "ADMIN";
}

export function createStaffRoles(prisma: PrismaClient) {
  return {
    async list(): Promise<AccountRow[]> {
      const rows = await prisma.adminUser.findMany({
        orderBy: [{ role: "asc" }, { email: "asc" }],
        select: { id: true, email: true, name: true, role: true, googleSub: true },
      });
      return rows.map(({ googleSub, ...r }) => ({ ...r, googleLinked: googleSub !== null }));
    },

    async setStaff(actor: AdminUser, targetId: string, staff: boolean): Promise<SetStaffResult> {
      if (!canManageRoles(actor.role)) return { ok: false, error: "forbidden" };
      if (actor.id === targetId) return { ok: false, error: "self" };
      const target = await prisma.adminUser.findUnique({ where: { id: targetId } });
      if (!target) return { ok: false, error: "not_found" };
      if (target.role !== "MEMBER" && target.role !== "STAFF") return { ok: false, error: "fixed_role" };
      // The role is re-read on every request (SessionService.read), so the change applies at once.
      await prisma.adminUser.updateMany({
        where: { id: targetId, role: { in: ["MEMBER", "STAFF"] } },
        data: { role: staff ? "STAFF" : "MEMBER" },
      });
      return { ok: true };
    },
  };
}
