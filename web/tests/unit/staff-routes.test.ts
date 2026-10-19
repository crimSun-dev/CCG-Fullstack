import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUser } from "@/lib/session-service";

// The routes' own gates, with the session and database swapped out.
let current: AdminUser | null = null;
const setStaff = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/admin-auth", () => ({ adminFromRequest: async () => current }));
vi.mock("@/lib/db", () => ({ db: () => ({}) }));
vi.mock("@/lib/staff-roles", () => ({ createStaffRoles: () => ({ setStaff }) }));

const { POST } = await import("@/app/admin/users/[id]/route");

const ID = "11111111-1111-4111-8111-111111111111";
const post = () =>
  POST(
    new NextRequest(`http://localhost/admin/users/${ID}`, {
      method: "POST",
      headers: { host: "localhost", "content-type": "application/x-www-form-urlencoded" },
      body: "staff=true",
    }),
    { params: Promise.resolve({ id: ID }) },
  );
const user = (role: AdminUser["role"]): AdminUser => ({ id: "u", email: "u@x.co", name: "U", role });

beforeEach(() => {
  setStaff.mockClear();
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
