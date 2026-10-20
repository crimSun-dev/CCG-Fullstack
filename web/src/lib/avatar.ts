import type { PrismaClient } from "@/generated/prisma/client";

// An account's profile picture. The account page resizes the chosen photo in the browser to a
// AVATAR_SIZE square before it is sent, so what arrives here is small; this file only checks it.
// The site serves it back at /avatars/<account id>, and CK Virtual Lab shows it from that URL.

export const AVATAR_SIZE = 256;
// A 256 px JPEG or WebP is 10 to 40 KB. The cap leaves room for a PNG and still bounds a page load.
export const AVATAR_MAX_BYTES = 256 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AvatarType = (typeof AVATAR_TYPES)[number];

export type AvatarFailure = { ok: false; error: "avatar_type" | "avatar_size" };
export type AvatarCheck = { ok: true; type: AvatarType } | AvatarFailure;

// The type comes from the bytes, never from the file name or the browser's claim, so an SVG or an
// HTML page renamed .jpg is refused rather than served back as an image.
export function sniffAvatar(bytes: Uint8Array): AvatarType | null {
  const at = (i: number, ...want: number[]) => want.every((b, j) => bytes[i + j] === b);
  if (bytes.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (bytes.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  // RIFF....WEBP
  if (bytes.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

export function checkAvatar(bytes: Uint8Array): AvatarCheck {
  if (bytes.length === 0 || bytes.length > AVATAR_MAX_BYTES) return { ok: false, error: "avatar_size" };
  const type = sniffAvatar(bytes);
  return type ? { ok: true, type } : { ok: false, error: "avatar_type" };
}

// The picture's public address. The version changes with every new picture, so the URL can be
// cached for good and a changed picture is simply a different URL.
export function avatarPath(userId: string, updatedAt: Date): string {
  return `/avatars/${userId}?v=${updatedAt.getTime()}`;
}

export interface AvatarStore {
  // Null when the account has no picture.
  version(userId: string): Promise<Date | null>;
  read(userId: string): Promise<{ image: Uint8Array; contentType: string; updatedAt: Date } | null>;
  save(userId: string, bytes: Uint8Array): Promise<{ ok: true; updatedAt: Date } | AvatarFailure>;
  remove(userId: string): Promise<void>;
}

export function createAvatarStore(prisma: PrismaClient, now: () => Date = () => new Date()): AvatarStore {
  return {
    async version(userId) {
      const row = await prisma.accountAvatar.findUnique({ where: { userId }, select: { updatedAt: true } });
      return row?.updatedAt ?? null;
    },
    async read(userId) {
      const row = await prisma.accountAvatar.findUnique({ where: { userId } });
      return row ? { image: row.image, contentType: row.contentType, updatedAt: row.updatedAt } : null;
    },
    async save(userId, bytes) {
      const check = checkAvatar(bytes);
      if (!check.ok) return check;
      const at = now();
      const data = { image: Buffer.from(bytes), contentType: check.type, updatedAt: at };
      await prisma.accountAvatar.upsert({ where: { userId }, create: { userId, ...data }, update: data });
      return { ok: true, updatedAt: at };
    },
    async remove(userId) {
      await prisma.accountAvatar.deleteMany({ where: { userId } });
    },
  };
}
