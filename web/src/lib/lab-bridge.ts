import { EventEmitter } from "node:events";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { Duplex } from "node:stream";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { env } from "./env";
import { publicUrl, requestMeta } from "./http";

// CK Virtual Lab served by this site at /lab. The lab's own Express server (../lab/server) runs inside
// this process on a loopback port; /lab/* is relayed to it (src/app/lab/[[...path]]/route.ts) and its
// /v1/live socket is handed over before Next sees the upgrade (installLabUpgrade). The lab keeps its
// own database (LAB_DATABASE_URL); this site never queries it. Staff still enter through the signed
// hand-off from /lab/launch, so the lab's sessions and checks are exactly those of a standalone lab.

export const LAB_PREFIX = "/lab";

type LabModules = {
  createApp: (opts: Record<string, unknown>) => http.RequestListener & { locals: { hub: unknown; authenticate: unknown } };
  createPool: (url: string) => unknown;
  resolveCompanyId: (pool: unknown, slug: string) => Promise<string>;
  attachLive: (server: EventEmitter, opts: Record<string, unknown>) => unknown;
};

type Lab = { port: number; upgrade: (req: http.IncomingMessage, socket: Duplex, head: Buffer) => void };

const g = globalThis as unknown as { __ccgLab?: Promise<Lab>; __ccgLabUpgrade?: boolean };

// The standalone server runs from .next/standalone, where the build copies the lab (scripts/bundle-lab.mjs).
// `next dev` and `next start` run from web/, beside the repo's lab/.
export function labRoot(cwd = process.cwd()): string | null {
  for (const dir of [path.resolve(cwd, "lab"), path.resolve(cwd, "..", "lab")]) {
    if (fs.existsSync(path.join(dir, "server", "src", "app.js"))) return dir;
  }
  return null;
}

function labModules(root: string): LabModules {
  // Node's own loader, fetched at run time: webpack rewrites a createRequire it can see, and the lab is
  // plain CommonJS on disk that the bundle never contains.
  const { createRequire } = process.getBuiltinModule("node:module");
  const require = createRequire(path.join(root, "server", "src", "app.js"));
  return {
    createApp: require("./app.js").createApp,
    createPool: require("./db.js").createPool,
    resolveCompanyId: require("./db.js").resolveCompanyId,
    attachLive: require("./live.js").attachLive,
  };
}

export function startLab(): Promise<Lab> {
  if (!g.__ccgLab) {
    const started = (async (): Promise<Lab> => {
      const e = env();
      if (!e.LAB_DATABASE_URL || !e.LAB_ASSERTION_SECRET) {
        throw new Error("LAB_DATABASE_URL and LAB_ASSERTION_SECRET are required to serve CK Virtual Lab");
      }
      const root = labRoot();
      if (!root) throw new Error("CK Virtual Lab's files are not on this server");
      const { createApp, createPool, resolveCompanyId, attachLive } = labModules(root);
      const pool = createPool(e.LAB_DATABASE_URL);
      const companyId = await resolveCompanyId(pool, e.LAB_COMPANY_SLUG);
      // trustProxy 1: this site is the one proxy in front, and says the visitor's IP and https.
      const app = createApp({
        pool,
        companyId,
        trustProxy: 1,
        ccgSecret: e.LAB_ASSERTION_SECRET,
        ccgSiteUrl: e.PUBLIC_SITE_URL ?? null,
      });
      const server = http.createServer(app);
      // The lab's socket handler listens on this emitter; installLabUpgrade feeds it.
      const upgrades = new EventEmitter();
      attachLive(upgrades, { hub: app.locals.hub, pool, companyId, trustProxy: 1, authenticate: app.locals.authenticate });
      const port = await new Promise<number>((resolve, reject) => {
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          if (addr && typeof addr === "object") resolve(addr.port);
          else reject(new Error("CK Virtual Lab did not bind"));
        });
      });
      return { port, upgrade: (req, socket, head) => upgrades.emit("upgrade", req, socket, head) };
    })();
    g.__ccgLab = started;
    // A failed start is retried on the next visit rather than remembered forever.
    started.catch((err: unknown) => {
      console.error("CK Virtual Lab failed to start:", err instanceof Error ? err.message : err);
      if (g.__ccgLab === started) g.__ccgLab = undefined;
    });
  }
  return g.__ccgLab;
}

const FORWARD = ["accept", "accept-language", "content-type", "cookie", "origin", "if-none-match", "if-modified-since", "range"];
const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "content-length"]);

// The lab's page and sign-in page load everything relative to their folder. Served at /lab (Next keeps
// no trailing slash), a <base> puts those relative URLs under /lab/.
export function withLabBase(html: string): string {
  const base = `<base href="${LAB_PREFIX}/">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => head + base) : base + html;
}

// The lab sets its session cookie on Path=/. Here it belongs to /lab only.
export function scopeCookie(cookie: string): string {
  return cookie.replace(/;\s*Path=\/(?=\s*;|\s*$)/i, `; Path=${LAB_PREFIX}`);
}

// Relays one request to the lab. `rest` is the path after /lab, without a leading slash.
export async function proxyLab(req: NextRequest, rest: string): Promise<Response> {
  let lab: Lab;
  try {
    lab = await startLab();
  } catch {
    return Response.json({ error: { code: "lab_unavailable", message: "CK Virtual Lab is not available" } }, { status: 503 });
  }
  const pub = publicUrl(req, "/");
  const headers: Record<string, string> = {};
  for (const name of FORWARD) {
    const value = req.headers.get(name);
    if (value) headers[name] = value;
  }
  // The lab checks Origin against Host and its scheme, and rate-limits per visitor: give it the public view.
  headers.host = pub.host;
  headers["x-forwarded-proto"] = pub.protocol.replace(/:$/, "");
  const ip = requestMeta(req).ip;
  if (ip !== "unknown") headers["x-forwarded-for"] = ip;
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.from(await req.arrayBuffer());
  if (body) headers["content-length"] = String(body.length);

  return new Promise<Response>((resolve) => {
    const upstream = http.request(
      { host: "127.0.0.1", port: lab.port, method: req.method, path: `/${rest}${req.nextUrl.search}`, headers },
      (res) => {
        const out = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (value === undefined || HOP_BY_HOP.has(name)) continue;
          if (name === "set-cookie") for (const c of value as string[]) out.append("set-cookie", scopeCookie(c));
          else out.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        const status = res.statusCode ?? 502;
        const empty = req.method === "HEAD" || status === 204 || status === 304;
        if (empty) {
          res.resume();
          resolve(new Response(null, { status, headers: out }));
        } else if (/^text\/html/i.test(String(res.headers["content-type"] ?? ""))) {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => resolve(new Response(withLabBase(Buffer.concat(chunks).toString("utf8")), { status, headers: out })));
          res.on("error", () => resolve(Response.json({ error: { code: "lab_unavailable" } }, { status: 502 })));
        } else {
          resolve(new Response(Readable.toWeb(res) as ReadableStream, { status, headers: out }));
        }
      },
    );
    upstream.on("error", () => {
      resolve(Response.json({ error: { code: "lab_unavailable", message: "CK Virtual Lab is not available" } }, { status: 502 }));
    });
    upstream.end(body);
  });
}

function first(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim() || undefined;
}

// Next's server never sees /lab/v1/live: Route Handlers cannot take a WebSocket upgrade, so the upgrade
// is handed to the lab's socket handler first. Only that one path is taken; every other upgrade goes
// on to whoever listens as before.
export function installLabUpgrade(): void {
  if (g.__ccgLabUpgrade) return;
  g.__ccgLabUpgrade = true;
  const emit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (this: http.Server, event: string | symbol, ...args: unknown[]) {
    if (event === "upgrade") {
      const [req, socket, head] = args as [http.IncomingMessage, Duplex, Buffer];
      const url = req.url ?? "";
      const pathname = url.split("?")[0];
      if (pathname === `${LAB_PREFIX}/v1/live`) {
        req.url = "/v1/live" + url.slice(pathname.length);
        // Behind Hostinger's proxy Host is the bind address; the lab compares Origin with the public host.
        const forwarded = first(req.headers["x-forwarded-host"]);
        if (forwarded) req.headers.host = forwarded;
        startLab().then(
          (lab) => lab.upgrade(req, socket, head),
          () => socket.destroy(),
        );
        return true;
      }
    }
    return Reflect.apply(emit, this, [event, ...args]) as boolean;
  } as typeof http.Server.prototype.emit;
}
