import { env } from "@/lib/env";
import { isStaffRole } from "@/lib/session-service";

// The supplied CK Virtual Lab image as a submit control. Rendered only for STAFF, EDITOR and ADMIN,
// and only when the lab hand-off is configured; /lab/launch checks the role again.
export function LabButton({ role }: { role: string }) {
  const { LAB_URL, LAB_ASSERTION_SECRET } = env();
  if (!isStaffRole(role) || !LAB_URL || !LAB_ASSERTION_SECRET) return null;
  return (
    <form method="post" action="/lab/launch" className="lab-launch">
      <button type="submit" className="lab-launch__button">
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed brand asset, not a content image */}
        <img src="/brand/ck-virtual-lab.png" alt="Open CK Virtual Lab" />
      </button>
    </form>
  );
}
