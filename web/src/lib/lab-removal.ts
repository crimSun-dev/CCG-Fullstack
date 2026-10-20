import { env, labTarget, type Env } from "./env";
import { postToLab } from "./lab-bridge";
import { issueLabRemoval } from "./token-assertion";

// Clearing STAFF removes the account from CK Virtual Lab: its name, sessions, notes and bookings
// (lab migration 014). The lab answers 200 whether or not the account ever entered, so a retry is safe.
//   "removed": the lab confirmed.  "skipped": no lab is configured here.  "failed": the lab was not reached.
export type LabRemovalResult = "removed" | "skipped" | "failed";

export const LAB_REMOVE_PATH = "v1/ccg/remove";

type Deps = { fetch?: typeof fetch; post?: typeof postToLab };

export async function removeFromLab(accountId: string, e: Env = env(), deps: Deps = {}): Promise<LabRemovalResult> {
  const target = labTarget(e);
  if (!target) return "skipped";
  const token = issueLabRemoval(accountId, e.LAB_ASSERTION_SECRET!);
  try {
    if (target === "embedded") {
      const status = await (deps.post ?? postToLab)(`/${LAB_REMOVE_PATH}`, { token });
      return status === 200 ? "removed" : "failed";
    }
    // Beside the lab's page, as the page itself calls v1/ccg/enter.
    const res = await (deps.fetch ?? fetch)(new URL(LAB_REMOVE_PATH, e.LAB_URL!), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? "removed" : "failed";
  } catch {
    return "failed";
  }
}
