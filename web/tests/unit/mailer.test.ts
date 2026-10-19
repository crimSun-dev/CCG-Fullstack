import { describe, expect, it } from "vitest";
import { withTimeout, type MailResult } from "@/lib/mailer";

describe("withTimeout", () => {
  it("returns FAILED when the provider never resolves, within the budget", async () => {
    const started = Date.now();
    const result = await withTimeout(new Promise<MailResult>(() => {}), 100);
    expect(result).toMatchObject({ status: "FAILED" });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("maps a thrown provider error to FAILED", async () => {
    const result = await withTimeout(Promise.reject(new Error("503 from provider")), 100);
    expect(result).toEqual({ status: "FAILED", reason: "503 from provider" });
  });

  it("passes SENT through", async () => {
    expect(await withTimeout(Promise.resolve({ status: "SENT" }), 100)).toEqual({ status: "SENT" });
  });
});
