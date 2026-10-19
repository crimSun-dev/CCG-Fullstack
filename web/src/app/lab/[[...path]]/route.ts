import type { NextRequest } from "next/server";
import { proxyLab } from "@/lib/lab-bridge";

// CK Virtual Lab at /lab/*, relayed to the lab's own server (src/lib/lab-bridge.ts). The lab decides
// who may enter: without its session a visitor gets only its "sign in through CCG" page.
// /lab/launch is this site's own route and is matched before this one.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };

// The lab's pages live at /lab (Next drops a trailing slash); proxyLab gives their HTML a <base>.
async function handle(req: NextRequest, ctx: Ctx) {
  const rest = ((await ctx.params).path ?? []).map(encodeURIComponent).join("/");
  return proxyLab(req, rest);
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
