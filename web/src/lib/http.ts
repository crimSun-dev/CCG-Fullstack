import type { NextRequest } from "next/server";
import type { RequestMeta } from "./lead-service";

export function requestMeta(req: NextRequest): RequestMeta {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || req.headers.get("x-real-ip") || "unknown",
    userAgent: req.headers.get("user-agent"),
  };
}

// A form post from a browser with JavaScript off, as opposed to the enhanced fetch() path.
export function isHtmlFormPost(req: NextRequest): boolean {
  const type = req.headers.get("content-type") ?? "";
  return type.startsWith("application/x-www-form-urlencoded") || type.startsWith("multipart/form-data");
}

// SameSite=Lax already keeps the session cookie off cross-site POSTs. This rejects a mismatched
// Origin as a second check on admin mutations.
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

// Behind Hostinger's proxy, req.url carries the bind address (0.0.0.0:3000), not the site. The
// browser-facing origin comes from the forwarded headers. Google rejects a redirect URI on an IP.
export function publicUrl(req: NextRequest, path: string): URL {
  const first = (name: string) => req.headers.get(name)?.split(",")[0]?.trim();
  const host = first("x-forwarded-host") || first("host");
  const proto = first("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "");
  return new URL(path, host ? `${proto}://${host}` : req.url);
}

// 303 so the browser follows with GET after a form POST.
export function seeOther(req: NextRequest, path: string): Response {
  return new Response(null, { status: 303, headers: { Location: publicUrl(req, path).toString() } });
}

// The origin written into account email. PUBLIC_SITE_URL wins; the forwarded host is the fallback
// so local dev and previews still produce working links.
export function siteOrigin(req: NextRequest, configured: string | undefined): string {
  if (configured) return new URL(configured).origin;
  return publicUrl(req, "/").origin;
}
