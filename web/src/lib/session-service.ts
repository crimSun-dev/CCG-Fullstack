import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";
import type { GoogleIdentity } from "./google-oidc";

// MEMBER is a general visitor. ADMIN and EDITOR are granted only by `pnpm admin:create`.
export type AdminRole = "ADMIN" | "EDITOR" | "MEMBER";

export function homeForRole(role: string): "/admin" | "/account" {
  return role === "ADMIN" || role === "EDITOR" ? "/admin" : "/account";
}

export type AdminUser = { id: string; email: string; name: string; role: AdminRole };

export interface SessionService {
  login(email: string, password: string): Promise<{ user: AdminUser; token: string } | null>;
  loginWithGoogle(identity: GoogleIdentity): Promise<{ user: AdminUser; token: string } | null>;
  read(token: string): Promise<AdminUser | null>;
  revoke(token: string): Promise<void>;
}

export const SESSION_COOKIE = "ccg_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const BCRYPT_COST = 12;

// Compared against when the email is unknown, so a miss costs the same time as a wrong password.
const DUMMY_HASH = bcrypt.hashSync("ccg-no-such-user", BCRYPT_COST);

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

function toAdminUser(u: { id: string; email: string; name: string; role: string }): AdminUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role as AdminRole };
}

export function createSessionService(prisma: PrismaClient): SessionService {
  // The raw token leaves this function once, in the cookie. Only its hash is stored.
  async function startSession(user: { id: string; email: string; name: string; role: string }) {
    const token = randomBytes(32).toString("base64url");
    await prisma.adminSession.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
      },
    });
    return { user: toAdminUser(user), token };
  }

  return {
    async login(email, password) {
      const user = await prisma.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
      const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !ok) return null;
      return startSession(user);
    },

    // A verified email is required. A stored Google subject wins. A verified email can attach
    // to an existing row once. A new verified email becomes a MEMBER. It never becomes ADMIN
    // or EDITOR; those roles come only from `pnpm admin:create`.
    async loginWithGoogle({ sub, email, emailVerified }) {
      if (!emailVerified || !sub || !email) return null;

      const linked = await prisma.adminUser.findUnique({ where: { googleSub: sub } });
      if (linked) return startSession(linked);

      const normalized = email.trim().toLowerCase();
      // googleSub: null in the filter, so a row already bound to another subject is never rebound.
      const { count } = await prisma.adminUser.updateMany({
        where: { email: normalized, googleSub: null },
        data: { googleSub: sub },
      });
      if (count === 1) return startSession(await prisma.adminUser.findUniqueOrThrow({ where: { googleSub: sub } }));

      const taken = await prisma.adminUser.findUnique({ where: { email: normalized } });
      if (taken) return null;

      const created = await prisma.adminUser.create({
        data: {
          email: normalized,
          name: normalized.split("@")[0] || "Visitor",
          role: "MEMBER",
          passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
          googleSub: sub,
        },
      });
      return startSession(created);
    },

    async read(token) {
      if (!token) return null;
      const session = await prisma.adminSession.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: true },
      });
      if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
      return toAdminUser(session.user);
    },

    async revoke(token) {
      if (!token) return;
      await prisma.adminSession.updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },
  };
}
