import { env, labTarget } from "@/lib/env";
import { isStaffRole } from "@/lib/session-service";
import { Arrow } from "./Arrow";

// The door out of the CCG site into CK Virtual Lab, for STAFF, EDITOR and ADMIN. A black plate like
// the header, the emblem's corner cut, and its construction rings behind (DESIGN.md). It posts to
// /lab/launch, which checks the role again. Until the lab has an address the door stays in view,
// shut, and says why, rather than leading to an error.

// The mark's own radii (ccg-mark.svg): outer C, inner C, centre disc.
const RINGS = [100, 72.57, 59.94, 32.35, 18.32];

export function LabButton({ role }: { role: string }) {
  if (!isStaffRole(role)) return null;
  const ready = labTarget(env()) !== null;
  return (
    <form method="post" action="/lab/launch" className="lab-launch">
      <button
        type="submit"
        className="lab-launch__button"
        disabled={!ready}
        aria-describedby={ready ? undefined : "lab-launch-note"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed brand asset at its drawn size */}
        <img className="lab-launch__mark" src="/brand/ck-virtual-lab-mark.png" alt="" width={74} height={40} />
        <span className="lab-launch__text">
          <span className="lab-launch__label">{ready ? "Open CK Virtual Lab" : "CK Virtual Lab"}</span>
          <span className="lab-launch__sub" id={ready ? undefined : "lab-launch-note"}>
            {ready ? "Staff only" : "Not connected yet"}
          </span>
        </span>
        {/* The arrow sits at the emblem's core: the rings are centred on it. */}
        <span className="lab-launch__go" aria-hidden="true">
          <svg className="lab-launch__rings" viewBox="-102 -102 204 204" focusable="false">
            {RINGS.map((r) => (
              <circle key={r} r={r} />
            ))}
            <path d="M0 0L72.4 -72.4M0 0L72.4 72.4" />
          </svg>
          {ready && <Arrow className="lab-launch__arrow" />}
        </span>
      </button>
    </form>
  );
}
