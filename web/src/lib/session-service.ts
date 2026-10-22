import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";
import type { GoogleIdentity } from "./google-oidc";

// MEMBER is a general visitor who registered or used Google. STAFF is granted by ADMIN or OWNER
// at /admin/users. ADMIN is granted only by OWNER there (or historically by `pnpm admin:create`).
// OWNER is the site owner mailbox; EDITOR stays CLI-only.
export type AdminRole = "OWNER" | "ADMIN" | "EDITOR" | "STAFF" | "MEMBER";

// The only owner mailbox. Its role is OWNER; nobody else may change that account.
export const OWNER_EMAIL = "draven.chen1st@gmail.com";

// Every role that reads enquiries and enters CK Virtual Lab. MEMBER never does.
// ADMIN includes staff access: promoting someone to ADMIN makes them staff automatically.
export const STAFF_ROLES: readonly AdminRole[] = ["OWNER", "ADMIN", "EDITOR", "STAFF"];

export function isStaffRole(role: string): boolean {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

// Every stored enquiry is readable by a staff role. A MEMBER cannot open or query the list.
export const canReadLeads = isStaffRole;

export function homeForRole(role: string): "/admin" | "/account" {
  return isStaffRole(role) ? "/admin" : "/account";
}

export const NAME_MAX = 120;
export const PASSWORD_MIN = 12;
// bcrypt reads only the first 72 bytes. A longer password would be silently truncated.
export const PASSWORD_MAX_BYTES = 72;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isOwnerEmail(email: string): boolean {
  return normalizeEmail(email) === OWNER_EMAIL;
}

// Loose on purpose: the emailed code is the real proof of an address.
export function isEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function cleanName(name: string): string | null {
  const n = name.trim().replace(/\s+/g, " ");
  return n && n.length <= NAME_MAX ? n : null;
}

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) return `Use at most ${PASSWORD_MAX_BYTES} bytes.`;
  return null;
}

export type RegisterResult =
  | { ok: true; user: AdminUser; token: string }
  | { ok: false; error: "invalid_email" | "invalid_name" | "weak_password" | "email_taken"; message: string };

export type AdminUser = { id: string; email: string; name: string; role: AdminRole };

export interface SessionService {
  login(email: string, password: string): Promise<{ user: AdminUser; token: string } | null>;
  loginWithGoogle(identity: GoogleIdentity): Promise<{ user: AdminUser; token: string } | null>;
  // Public sign-up. Always MEMBER. An existing email is left exactly as it was.
  register(input: { email: string; password: string; name: string }): Promise<RegisterResult>;
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
  // The owner mailbox always stays OWNER, even if a row was created as MEMBER before the migration.
  async function withOwnerRole(user: { id: string; email: string; name: string; role: string }) {
    if (!isOwnerEmail(user.email) || user.role === "OWNER") return user;
    await prisma.adminUser.update({ where: { id: user.id }, data: { role: "OWNER" } });
    return { ...user, role: "OWNER" };
  }

  // The raw token leaves this function once, in the cookie. Only its hash is stored.
  async function startSession(user: { id: string; email: string; name: string; role: string }) {
    const ready = await withOwnerRole(user);
    const token = randomBytes(32).toString("base64url");
    await prisma.adminSession.create({
      data: {
        userId: ready.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
      },
    });
    return { user: toAdminUser(ready), token };
  }

  return {
    async login(email, password) {
      const user = await prisma.adminUser.findUnique({ where: { email: normalizeEmail(email) } });
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

      const normalized = normalizeEmail(email);
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
          role: isOwnerEmail(normalized) ? "OWNER" : "MEMBER",
          passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
          googleSub: sub,
        },
      });
      return startSession(created);
    },

    async register({ email, password, name }) {
      const normalized = normalizeEmail(email);
      if (!isEmail(normalized)) return { ok: false, error: "invalid_email", message: "Enter a valid email address." };
      const fullName = cleanName(name);
      if (!fullName) return { ok: false, error: "invalid_name", message: `Enter your full name (up to ${NAME_MAX} characters).` };
      const weak = passwordProblem(password);
      if (weak) return { ok: false, error: "weak_password", message: weak };

      const taken: RegisterResult = {
        ok: false,
        error: "email_taken",
        message: "An account with this email already exists. Sign in, or reset the password.",
      };
      if (await prisma.adminUser.findUnique({ where: { email: normalized } })) return taken;
      try {
        const created = await prisma.adminUser.create({
          data: {
            email: normalized,
            name: fullName,
            role: isOwnerEmail(normalized) ? "OWNER" : "MEMBER",
            passwordHash: await hashPassword(password),
          },
        });
        return { ok: true, ...(await startSession(created)) };
      } catch (err) {
        // Two sign-ups for one email at once: the unique index decides, the loser changes nothing.
        if ((err as { code?: string }).code === "P2002") return taken;
        throw err;
      }
    },

    async read(token) {
      if (!token) return null;
      const session = await prisma.adminSession.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: true },
      });
      if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
      return toAdminUser(await withOwnerRole(session.user));
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
