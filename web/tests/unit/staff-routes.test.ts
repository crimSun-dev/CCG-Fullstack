import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUser } from "@/lib/session-service";

let current: AdminUser | null = null;
const setRole = vi.fn(async () => ({ ok: true, previous: "MEMBER", next: "STAFF" as const }));
const lostLabAccess = vi.fn((previous: string, next: string) => previous !== "MEMBER" && next === "MEMBER");
vi.mock("@/lib/admin-auth", () => ({ adminFromRequest: async () => current }));
vi.mock("@/lib/db", () => ({ db: () => ({}) }));
vi.mock("@/lib/staff-roles", async () => {
  const actual = await vi.importActual<typeof import("@/lib/staff-roles")>("@/lib/staff-roles");
  return { ...actual, createStaffRoles: () => ({ setRole, lostLabAccess }) };
});
const removeFromLab = vi.fn(async (): Promise<"removed" | "skipped" | "failed"> => "removed");
vi.mock("@/lib/lab-removal", () => ({ removeFromLab }));

const { POST } = await import("@/app/admin/users/[id]/route");

const ID = "11111111-1111-4111-8111-111111111111";
const post = (role = "STAFF", q?: string) =>
  POST(
    new NextRequest(`http://localhost/admin/users/${ID}`, {
      method: "POST",
      headers: { host: "localhost", "content-type": "application/x-www-form-urlencoded" },
      body: q ? `role=${role}&q=${encodeURIComponent(q)}` : `role=${role}`,
    }),
    { params: Promise.resolve({ id: ID }) },
  );
const user = (role: AdminUser["role"]): AdminUser => ({ id: "u", email: "u@x.co", name: "U", role });

beforeEach(() => {
  setRole.mockClear();
  setRole.mockResolvedValue({ ok: true, previous: "MEMBER", next: "STAFF" });
  lostLabAccess.mockClear();
  lostLabAccess.mockImplementation((previous, next) => previous !== "MEMBER" && next === "MEMBER");
  removeFromLab.mockClear();
});

describe("POST /admin/users/[id]", () => {
  it("sends a signed-out visitor to /login", async () => {
    current = null;
    const res = await post();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/login$/);
    expect(setRole).not.toHaveBeenCalled();
  });

  it.each(["MEMBER", "STAFF", "EDITOR"] as const)("refuses %s with 403", async (role) => {
    current = user(role);
    expect((await post()).status).toBe(403);
    expect(setRole).not.toHaveBeenCalled();
  });

  it("lets an ADMIN grant staff", async () => {
    current = user("ADMIN");
    const res = await post("STAFF");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/admin\/users\?saved=staff$/);
    expect(setRole).toHaveBeenCalledWith(current, ID, "STAFF");
    expect(removeFromLab).not.toHaveBeenCalled();
  });

  it("lets an OWNER grant admin", async () => {
    current = user("OWNER");
    setRole.mockResolvedValueOnce({ ok: true, previous: "MEMBER", next: "ADMIN" });
    const res = await post("ADMIN");
    expect(res.headers.get("location")).toMatch(/\/admin\/users\?saved=admin$/);
    expect(setRole).toHaveBeenCalledWith(current, ID, "ADMIN");
  });

  it("keeps the search query after granting staff", async () => {
    current = user("ADMIN");
    const res = await post("STAFF", "draven");
    expect(res.headers.get("location")).toBe("http://localhost/admin/users?saved=staff&q=draven");
  });

  it("clearing to member removes the account from CK Virtual Lab", async () => {
    current = user("ADMIN");
    setRole.mockResolvedValueOnce({ ok: true, previous: "STAFF", next: "MEMBER" });
    const res = await post("MEMBER");
    expect(res.headers.get("location")).toMatch(/\/admin\/users\?saved=cleared$/);
    expect(removeFromLab).toHaveBeenCalledWith(ID);
  });

  it("says so, with the account to retry, when the lab is not reached", async () => {
    current = user("ADMIN");
    setRole.mockResolvedValueOnce({ ok: true, previous: "STAFF", next: "MEMBER" });
    removeFromLab.mockResolvedValueOnce("failed");
    const res = await post("MEMBER");
    expect(res.headers.get("location")).toBe(`http://localhost/admin/users?error=lab_unreached&id=${ID}`);
  });

  it("leaves the lab alone when the role change itself is refused", async () => {
    current = user("ADMIN");
    setRole.mockResolvedValueOnce({ ok: false, error: "fixed_role" });
    await post("MEMBER");
    expect(removeFromLab).not.toHaveBeenCalled();
  });

  it("refuses a cross-origin post", async () => {
    current = user("ADMIN");
    const res = await POST(
      new NextRequest(`http://localhost/admin/users/${ID}`, {
        method: "POST",
        headers: { host: "localhost", origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" },
        body: "role=STAFF",
      }),
      { params: Promise.resolve({ id: ID }) },
    );
    expect(res.status).toBe(403);
  });
});
