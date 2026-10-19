import { createRequire } from "node:module";
import type http from "node:http";
import path from "node:path";

/** Matches office/server/src/staff-access.js. The server is the authority. */
export function staffPermissions(role: string): { role: "ADMIN" | "EDITOR"; notes: true; draw: true; canClear: boolean } | null {
  if (role !== "ADMIN" && role !== "EDITOR") return null;
  return { role, notes: true, draw: true, canClear: role === "ADMIN" };
}

export const STAFF_HEADER = "x-ccg-staff-role";

type OfficeApp = {
  listen: (port: number, host: string, cb: () => void) => http.Server;
};

type OfficeModules = {
  createApp: (opts: { pool: unknown; companyId: string; staffGate: boolean }) => OfficeApp;
  createPool: (url: string) => unknown;
  resolveCompanyId: (pool: unknown, slug: string) => Promise<string>;
};

const g = globalThis as unknown as { __ccgOffice?: Promise<number> };

function officeModules(): OfficeModules {
  const entry = path.join(officeServerRoot(), "src", "app.js");
  const require = createRequire(entry);
  return {
    createApp: require("./app.js").createApp,
    createPool: require("./db.js").createPool,
    resolveCompanyId: require("./db.js").resolveCompanyId,
  };
}

export function officeServerRoot(): string {
  return path.resolve(process.cwd(), "..", "office", "server");
}

export function officeSiteRoot(): string {
  return path.resolve(process.cwd(), "..", "office", "scrollcraft", "builds", "creative-episode");
}

/** Loopback wall server. The public site database is never this database. */
export function startOfficeServer(): Promise<number> {
  if (!g.__ccgOffice) {
    const url = process.env.OFFICE_DATABASE_URL?.trim();
    const slug = process.env.HUB_COMPANY_SLUG?.trim();
    if (!url || !slug) {
      g.__ccgOffice = Promise.reject(
        new Error("OFFICE_DATABASE_URL and HUB_COMPANY_SLUG are required for the virtual office"),
      );
    } else {
      const { createApp, createPool, resolveCompanyId } = officeModules();
      const pool = createPool(url);
      g.__ccgOffice = resolveCompanyId(pool, slug).then(
        (companyId) =>
          new Promise<number>((resolve, reject) => {
            const app = createApp({ pool, companyId, staffGate: true });
            const server = app.listen(0, "127.0.0.1", () => {
              const addr = server.address();
              if (addr && typeof addr === "object") resolve(addr.port);
              else reject(new Error("Office server did not bind"));
            });
            server.on("error", reject);
          }),
      );
    }
  }
  return g.__ccgOffice;
}

export async function proxyOffice(req: Request, role: string, pathname: string, search: string): Promise<Response> {
  let port: number;
  try {
    port = await startOfficeServer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Office server is not available";
    return Response.json({ error: { code: "office_unavailable", message } }, { status: 503 });
  }
  const headers = new Headers();
  const accept = req.headers.get("accept");
  if (accept) headers.set("accept", accept);
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set(STAFF_HEADER, role);
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  const upstream = await fetch(`http://127.0.0.1:${port}${pathname}${search}`, {
    method: req.method,
    headers,
    body,
  });
  const out = new Headers();
  const type = upstream.headers.get("content-type");
  if (type) out.set("content-type", type);
  out.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
