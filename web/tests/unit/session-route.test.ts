import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import type { AdminUser } from "@/lib/session-service";

let current: AdminUser | null = null;
vi.mock("@/lib/admin-auth", () => ({ adminFromRequest: async () => current }));

const { GET } = await import("@/app/api/v1/session/route");
const ask = () => GET(new NextRequest("http://localhost/api/v1/session"));

describe("GET /api/v1/session (the nav's Sign in / Your account)", () => {
  it("says signed out, and is never cached", async () => {
    current = null;
    const res = await ask();
    expect(await res.json()).toEqual({ signedIn: false });
    expect(res.headers.get("cache-control")).toBe("no-store, private");
  });

  it.each(["MEMBER", "STAFF", "EDITOR", "ADMIN"] as const)("says signed in for %s, and nothing else about them", async (role) => {
    current = { id: "u", email: "u@x.co", name: "Draven Chen", role };
    expect(await (await ask()).json()).toEqual({ signedIn: true });
  });
});
