import { describe, expect, it } from "vitest";
import { staffPermissions } from "@/lib/office-bridge";

describe("staff office permissions", () => {
  it("lets admin clear and editor write, and refuses a member", () => {
    expect(staffPermissions("ADMIN")?.canClear).toBe(true);
    expect(staffPermissions("EDITOR")).toEqual({ role: "EDITOR", notes: true, draw: true, canClear: false });
    expect(staffPermissions("MEMBER")).toBeNull();
  });
});
