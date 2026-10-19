import { NextRequest } from "next/server";
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUser } from "@/lib/session-service";
import { verifyLabAssertion } from "@/lib/token-assertion";

const SECRET = "s".repeat(40);
let current: AdminUser | null = null;
let labConfigured = true;
const findMany = vi.fn(async (_args?: unknown) => []);
const listPeople = vi.fn(async () => []);

vi.mock("@/lib/admin-auth", () => ({ currentAdmin: async () => current, adminFromRequest: async () => current }));
vi.mock("@/lib/env", () => ({
  env: () => (labConfigured ? { LAB_URL: "https://lab.example/", LAB_ASSERTION_SECRET: SECRET } : {}),
}));
vi.mock("@/lib/db", () => ({ db: () => ({ lead: { findMany, count: async () => 0 } }) }));
vi.mock("@/lib/services", () => ({ liveContent: () => ({ listPublicPrograms: async () => [], listPeople }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const { default: AdminPage } = await import("@/app/admin/page");
const { LabButton } = await import("@/components/LabButton");
const { POST: launch } = await import("@/app/lab/launch/route");

const user = (role: AdminUser["role"]): AdminUser => ({ id: "id-1", email: "draven@ccg.test", name: "Draven Chen", role });
const openAdmin = () => AdminPage({ searchParams: Promise.resolve({}) });

// Finds every element matching a test in a server-rendered tree, without a DOM.
function findAll(node: unknown, match: (el: ReactElement) => boolean, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, match, out));
  else if (isValidElement(node)) {
    if (match(node)) out.push(node);
    findAll((node.props as { children?: unknown }).children, match, out);
  }
  return out;
}

beforeEach(() => {
  findMany.mockClear();
  listPeople.mockClear();
  labConfigured = true;
});

describe("enquiry list (/admin)", () => {
  it("a MEMBER is sent to /account before any lead is queried", async () => {
    current = user("MEMBER");
    await expect(openAdmin()).rejects.toThrow("REDIRECT /account");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("signed out goes to /login", async () => {
    current = null;
    await expect(openAdmin()).rejects.toThrow("REDIRECT /login");
  });

  it.each(["STAFF", "EDITOR", "ADMIN"] as const)("%s reads every enquiry, unfiltered", async (role) => {
    current = user(role);
    await openAdmin();
    expect(findMany).toHaveBeenCalledTimes(1);
    expect((findMany.mock.calls[0][0] as Record<string, unknown>).where).toBeUndefined();
  });

  it("STAFF does not get the content forms; EDITOR does", async () => {
    current = user("STAFF");
    await openAdmin();
    expect(listPeople).not.toHaveBeenCalled();
    current = user("EDITOR");
    await openAdmin();
    expect(listPeople).toHaveBeenCalled();
  });
});

describe("CK Virtual Lab button", () => {
  it("is absent for a MEMBER", () => {
    expect(LabButton({ role: "MEMBER" })).toBeNull();
  });

  it.each(["STAFF", "EDITOR", "ADMIN"])("shows the supplied image as a submit control for %s", (role) => {
    const el = LabButton({ role })!;
    expect(el.props).toMatchObject({ method: "post", action: "/lab/launch" });
    const [img] = findAll(el, (e) => e.type === "img");
    expect(img.props).toMatchObject({ src: "/brand/ck-virtual-lab.png" });
    expect(findAll(el, (e) => e.type === "button")[0].props).toMatchObject({ type: "submit" });
  });

  it("stays visible when the lab hand-off is not configured", () => {
    labConfigured = false;
    expect(LabButton({ role: "ADMIN" })!.props).toMatchObject({ method: "post", action: "/lab/launch" });
  });

  it("is on the staff admin page", async () => {
    current = user("STAFF");
    const tree = await openAdmin();
    expect(findAll(tree, (e) => e.type === LabButton)).toHaveLength(1);
  });
});

describe("POST /lab/launch", () => {
  const post = (headers: Record<string, string> = {}) =>
    launch(new NextRequest("http://localhost/lab/launch", { method: "POST", headers: { host: "localhost", ...headers } }));

  it("sends staff to the lab with a signed assertion in the fragment", async () => {
    current = user("STAFF");
    const res = await post();
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://lab.example/");
    expect(location.search).toBe("");
    const token = location.hash.replace(/^#ccg=/, "");
    expect(verifyLabAssertion(token, SECRET)).toMatchObject({ email: "draven@ccg.test", name: "Draven Chen", role: "STAFF" });
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("refuses a MEMBER, a stranger, and another origin", async () => {
    current = user("MEMBER");
    expect((await post()).status).toBe(403);
    current = null;
    expect((await post()).headers.get("location")).toMatch(/\/login$/);
    current = user("ADMIN");
    expect((await post({ origin: "https://evil.example" })).status).toBe(403);
  });

  it("sends staff back to admin when the lab is not configured", async () => {
    current = user("ADMIN");
    labConfigured = false;
    const res = await post();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/admin\?error=lab$/);
  });
});
