import { isStaffRole } from "@/lib/session-service";

// The supplied CK Virtual Lab image as a submit control. Rendered for STAFF, EDITOR and ADMIN.
// /lab/launch checks the role again, and refuses the hand-off when the lab address is unset.
export function LabButton({ role }: { role: string }) {
  if (!isStaffRole(role)) return null;
  return (
    <form method="post" action="/lab/launch" className="lab-launch">
      <button type="submit" className="lab-launch__button">
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed brand asset, not a content image */}
        <img src="/brand/ck-virtual-lab.png" alt="Open CK Virtual Lab" />
      </button>
    </form>
  );
}
