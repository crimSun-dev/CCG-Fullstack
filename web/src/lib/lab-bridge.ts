import { EventEmitter } from "node:events";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { Duplex, Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { env } from "./env";
import { publicUrl, requestMeta } from "./http";

// CK Virtual Lab served by this site at /lab. The lab's own Express server (../lab/server) runs inside
// this process without a port: Hostinger's Node loader allows one listen() per app ("http.Server.listen()
// was called more than once, ignore"), so each request reaches the lab over an in-memory socket pair
// handed to its server as a connection (connectLab). /lab/* is relayed to it (src/app/lab/[[...path]]/route.ts) and its
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

type Lab = {
  // A fresh in-memory connection into the lab's HTTP server, client side.
  connect: () => Duplex;
  upgrade: (req: http.IncomingMessage, socket: Duplex, head: Buffer) => void;
};

// How long a visitor waits for the lab to come up before getting a 503 instead of a spinner.
export const LAB_START_TIMEOUT_MS = 15_000;

// Two connected in-memory streams: what one writes, the other reads. Each side also answers the
// socket calls Node's HTTP server and client make (timeouts, no-delay, keep-alive, addresses).
export function socketPair(): [Duplex, Duplex] {
  const sides: Duplex[] = [];
  const make = (peer: () => Duplex) => {
    const side = new Duplex({
      read() {},
      write(chunk, _encoding, done) {
        peer().push(chunk);
        done();
      },
      final(done) {
        peer().push(null);
        done();
      },
      destroy(err, done) {
        const other = peer();
        if (!other.destroyed) other.push(null);
        done(err);
      },
    });
    return Object.assign(side, {
      remoteAddress: "127.0.0.1",
      remotePort: 0,
      encrypted: false,
      setTimeout() { return side; },
      setNoDelay() { return side; },
      setKeepAlive() { return side; },
      ref() { return side; },
      unref() { return side; },
      address() { return { address: "127.0.0.1", family: "IPv4", port: 0 }; },
    });
  };
  sides.push(make(() => sides[1]), make(() => sides[0]));
  return [sides[0], sides[1]];
}

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms}ms`)), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

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
      const companyId = await withTimeout(resolveCompanyId(pool, e.LAB_COMPANY_SLUG), LAB_START_TIMEOUT_MS, "Reaching the lab database");
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
      // Never listen(): connections are handed to the server directly (any Duplex will do).
      server.on("clientError", (_err, socket) => socket.destroy());
      return {
        connect: () => {
          const [client, serverSide] = socketPair();
          server.emit("connection", serverSide);
          return client;
        },
        upgrade: (req, socket, head) => upgrades.emit("upgrade", req, socket, head),
      };
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
    lab = await withTimeout(startLab(), LAB_START_TIMEOUT_MS, "Starting CK Virtual Lab");
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
  // One in-memory connection per request.
  headers.connection = "close";

  return new Promise<Response>((resolve) => {
    const upstream = http.request(
      { createConnection: () => lab.connect(), method: req.method, path: `/${rest}${req.nextUrl.search}`, headers },
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

// A server-to-server JSON POST into the embedded lab, for notices this site sends on its own (no
// visitor request behind it). Resolves the lab's status code; rejects when the lab cannot start.
export async function postToLab(path: string, json: unknown): Promise<number> {
  const lab = await withTimeout(startLab(), LAB_START_TIMEOUT_MS, "Starting CK Virtual Lab");
  const body = Buffer.from(JSON.stringify(json));
  return new Promise<number>((resolve, reject) => {
    const upstream = http.request(
      {
        createConnection: () => lab.connect(),
        method: "POST",
        path,
        headers: { host: "localhost", "content-type": "application/json", "content-length": String(body.length), connection: "close" },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 502);
      },
    );
    upstream.on("error", reject);
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
