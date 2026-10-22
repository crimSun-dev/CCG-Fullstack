import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUser } from "@/lib/session-service";

// The routes' own gates, with the session and database swapped out.
let current: AdminUser | null = null;
const setStaff = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/admin-auth", () => ({ adminFromRequest: async () => current }));
vi.mock("@/lib/db", () => ({ db: () => ({}) }));
vi.mock("@/lib/staff-roles", async () => {
  const actual = await vi.importActual<typeof import("@/lib/staff-roles")>("@/lib/staff-roles");
  return { ...actual, createStaffRoles: () => ({ setStaff }) };
});
const removeFromLab = vi.fn(async (): Promise<"removed" | "skipped" | "failed"> => "removed");
vi.mock("@/lib/lab-removal", () => ({ removeFromLab }));

const { POST } = await import("@/app/admin/users/[id]/route");

const ID = "11111111-1111-4111-8111-111111111111";
const post = (staff = true, q?: string) =>
  POST(
    new NextRequest(`http://localhost/admin/users/${ID}`, {
      method: "POST",
      headers: { host: "localhost", "content-type": "application/x-www-form-urlencoded" },
      body: q ? `staff=${staff}&q=${encodeURIComponent(q)}` : `staff=${staff}`,
    }),
    { params: Promise.resolve({ id: ID }) },
  );
const user = (role: AdminUser["role"]): AdminUser => ({ id: "u", email: "u@x.co", name: "U", role });

beforeEach(() => {
  setStaff.mockClear();
  removeFromLab.mockClear();
});

describe("POST /admin/users/[id]", () => {
  it("sends a signed-out visitor to /login", async () => {
    current = null;
    const res = await post();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/login$/);
    expect(setStaff).not.toHaveBeenCalled();
  });

  it.each(["MEMBER", "STAFF", "EDITOR"] as const)("refuses %s with 403", async (role) => {
    current = user(role);
    expect((await post()).status).toBe(403);
    expect(setStaff).not.toHaveBeenCalled();
  });

  it("lets an ADMIN through", async () => {
    current = user("ADMIN");
    const res = await post();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/admin\/users\?saved=granted$/);
    expect(setStaff).toHaveBeenCalledWith(current, ID, true);
    expect(removeFromLab).not.toHaveBeenCalled();
  });

  it("keeps the search query after granting staff", async () => {
    current = user("ADMIN");
    const res = await post(true, "draven");
    expect(res.headers.get("location")).toBe("http://localhost/admin/users?saved=granted&q=draven");
  });

  it("clearing staff removes the account from CK Virtual Lab", async () => {
    current = user("ADMIN");
    const res = await post(false);
    expect(res.headers.get("location")).toMatch(/\/admin\/users\?saved=cleared$/);
    expect(setStaff).toHaveBeenCalledWith(current, ID, false);
    expect(removeFromLab).toHaveBeenCalledWith(ID);
  });

  it("says so, with the account to retry, when the lab is not reached", async () => {
    current = user("ADMIN");
    removeFromLab.mockResolvedValueOnce("failed");
    const res = await post(false);
    expect(res.headers.get("location")).toBe(`http://localhost/admin/users?error=lab_unreached&id=${ID}`);
  });

  it("leaves the lab alone when the role change itself is refused", async () => {
    current = user("ADMIN");
    setStaff.mockResolvedValueOnce({ ok: false, error: "fixed_role" } as never);
    await post(false);
    expect(removeFromLab).not.toHaveBeenCalled();
  });

  it("refuses a cross-origin post", async () => {
    current = user("ADMIN");
    const res = await POST(
      new NextRequest(`http://localhost/admin/users/${ID}`, {
        method: "POST",
        headers: { host: "localhost", origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" },
        body: "staff=true",
      }),
      { params: Promise.resolve({ id: ID }) },
    );
    expect(res.status).toBe(403);
  });
});
