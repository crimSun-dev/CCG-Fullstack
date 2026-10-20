import type { NextRequest } from "next/server";
import { avatarStore } from "@/lib/services";

// A profile picture, public by account id like any avatar on the web: CK Virtual Lab shows it to
// the other staff on the wall. The account id is a random UUID and the picture is all this reveals.

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return new Response(null, { status: 404 });
  const avatar = await avatarStore().read(id);
  if (!avatar) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

  const version = String(avatar.updatedAt.getTime());
  const etag = `"${version}"`;
  const headers: Record<string, string> = {
    "Content-Type": avatar.contentType,
    ETag: etag,
    // The URL with the current ?v never changes meaning; any other URL must check back.
    "Cache-Control":
      req.nextUrl.searchParams.get("v") === version ? "public, max-age=31536000, immutable" : "public, no-cache",
    // Stored bytes were sniffed as an image on the way in; this keeps a browser from reading them as anything else.
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    // The lab may run on another origin (LAB_URL) and still show it.
    "Cross-Origin-Resource-Policy": "cross-origin",
  };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(Buffer.from(avatar.image), { status: 200, headers });
}
