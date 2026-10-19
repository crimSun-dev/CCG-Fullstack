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

// 303 so the browser follows with GET after a form POST.
export function seeOther(req: NextRequest, path: string): Response {
  return new Response(null, { status: 303, headers: { Location: new URL(path, req.url).toString() } });
}
