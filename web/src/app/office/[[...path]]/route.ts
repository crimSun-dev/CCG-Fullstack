import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { adminFromRequest } from "@/lib/admin-auth";
import { officeSiteRoot, proxyOffice, staffPermissions } from "@/lib/office-bridge";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

async function allow(req: NextRequest) {
  const user = await adminFromRequest(req);
  if (!user) return { response: NextResponse.redirect(new URL("/login", req.url)) };
  const perms = staffPermissions(user.role);
  if (!perms) return { response: NextResponse.redirect(new URL("/account", req.url)) };
  return { user, perms };
}

function staffConfig(perms: NonNullable<ReturnType<typeof staffPermissions>>, name: string): string {
  const staff = { ...perms, name };
  return `window.CE_STORE = 'api';\nwindow.CE_STAFF = ${JSON.stringify(staff)};\n`;
}

async function readSiteFile(rel: string): Promise<{ body: Buffer; type: string } | null> {
  const root = officeSiteRoot();
  const file = path.resolve(root, rel);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (file !== root && !file.startsWith(rootWithSep)) return null;
  try {
    const body = await fs.readFile(file);
    return { body, type: TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

async function handle(req: NextRequest, parts: string[] | undefined) {
  const gate = await allow(req);
  if ("response" in gate && gate.response) return gate.response;
  const { user, perms } = gate as { user: { name: string; role: string }; perms: NonNullable<ReturnType<typeof staffPermissions>> };

  const url = new URL(req.url);
  if (url.pathname === "/office") {
    return NextResponse.redirect(new URL("/office/", req.url), 308);
  }

  const relParts = parts ?? [];
  const rel = relParts.join("/");

  if (rel === "v1" || rel.startsWith("v1/")) {
    return proxyOffice(req, user.role, `/${rel}`, url.search);
  }

  if (rel === "ce-config.js") {
    return new NextResponse(staffConfig(perms, user.name), {
      headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const fileRel = rel === "" ? "index.html" : rel;
  const file = await readSiteFile(fileRel);
  if (!file) return new NextResponse("Not found", { status: 404 });
  const cache = fileRel === "index.html" ? "no-store" : "private, max-age=3600";
  return new NextResponse(new Uint8Array(file.body), {
    headers: { "content-type": file.type, "cache-control": cache },
  });
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, (await ctx.params).path);
}
export async function HEAD(req: NextRequest, ctx: Ctx) {
  return handle(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, (await ctx.params).path);
}
