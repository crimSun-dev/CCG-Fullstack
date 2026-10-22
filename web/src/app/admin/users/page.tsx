import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { currentAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { canManageAdmins, canManageRoles, cleanSearch, createStaffRoles } from "@/lib/staff-roles";
import { isOwnerEmail } from "@/lib/session-service";

export const metadata: Metadata = { title: "Accounts", robots: { index: false, follow: false } };

const SAVED: Record<string, string> = {
  staff: "Staff granted.",
  admin: "Admin granted (includes staff access).",
  cleared: "Role cleared to member and removed from CK Virtual Lab if they had staff access.",
};
const ERRORS: Record<string, string> = {
  self: "You cannot change your own role.",
  fixed_role: "That account's role is not changed from this page.",
  owner_protected: "The owner account cannot be changed.",
  invalid_role: "Choose member, staff, or admin.",
  lab_unreached: "Role cleared, but CK Virtual Lab could not be reached, so their name is still there.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { searchParams: Promise<{ saved?: string; error?: string; id?: string; q?: string }> };

function RoleActions({
  actorRole,
  actorId,
  account,
  keepQ,
}: {
  actorRole: string;
  actorId: string;
  account: { id: string; email: string; role: string };
  keepQ: ReactNode;
}) {
  if (account.id === actorId) return null;
  if (account.role === "OWNER" || isOwnerEmail(account.email) || account.role === "EDITOR") return null;

  const owner = canManageAdmins(actorRole);
  const forms: { role: string; label: string; quiet?: boolean }[] = [];

  if (account.role === "MEMBER") {
    forms.push({ role: "STAFF", label: "Make staff" });
    if (owner) forms.push({ role: "ADMIN", label: "Make admin" });
  } else if (account.role === "STAFF") {
    forms.push({ role: "MEMBER", label: "Clear staff", quiet: true });
    if (owner) forms.push({ role: "ADMIN", label: "Make admin" });
  } else if (account.role === "ADMIN" && owner) {
    forms.push({ role: "STAFF", label: "Clear admin (keep staff)", quiet: true });
    forms.push({ role: "MEMBER", label: "Clear to member", quiet: true });
  } else {
    return null;
  }

  return (
    <div className="admin-role-actions">
      {forms.map((f) => (
        <form key={f.role + f.label} method="post" action={`/admin/users/${account.id}`}>
          <input type="hidden" name="role" value={f.role} />
          {keepQ}
          <button type="submit" className={f.quiet ? "op-quiet" : undefined}>
            {f.label}
          </button>
        </form>
      ))}
    </div>
  );
}

// Accounts list for OWNER and ADMIN. OWNER may grant ADMIN; ADMIN may only grant STAFF.
export default async function UsersPage({ searchParams }: Props) {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  if (!canManageRoles(admin.role)) notFound();

  const params = await searchParams;
  const q = cleanSearch(params.q);
  const accounts = await createStaffRoles(db()).list(q);
  const keepQ = q ? <input type="hidden" name="q" value={q} /> : null;
  const owner = canManageAdmins(admin.role);

  return (
    <div className="operate">
      <div className="ccg-wrap">
        <div className="operate__bar">
          <div>
            <h1>Accounts</h1>
            <p className="operate__who">
              Signed in as {admin.name} ({admin.role})
            </p>
          </div>
          <p>
            <Link href="/admin">Back to admin</Link>
          </p>
        </div>
        {params.saved && SAVED[params.saved] && <p role="status">{SAVED[params.saved]}</p>}
        {params.error && <p role="alert">{ERRORS[params.error] ?? "Not saved."}</p>}
        {params.error === "lab_unreached" && params.id && UUID.test(params.id) && (
          <form method="post" action={`/admin/users/${params.id}`}>
            <input type="hidden" name="role" value="MEMBER" />
            {keepQ}
            <button type="submit">Remove from CK Virtual Lab again</button>
          </form>
        )}

        <section className="admin-section">
          <h2>Registered accounts{q ? ` matching “${q}”` : ""} ({accounts.length})</h2>
          <p>
            STAFF can read every enquiry and enter CK Virtual Lab. ADMIN can do that and grant or clear STAFF for others,
            but cannot change other admins or the owner. ADMIN includes staff access.
            {owner
              ? " As owner, you can also grant or clear ADMIN."
              : " Only the owner can grant or clear ADMIN."}{" "}
            Changes apply at once, without a new sign-in. Clearing someone to member also removes them from CK Virtual Lab.
          </p>
          <form className="admin-search" method="get" action="/admin/users" role="search">
            <p>
              <label>
                Search by name or email
                <input
                  name="q"
                  type="search"
                  defaultValue={q ?? ""}
                  placeholder="Name or email"
                  autoComplete="off"
                  maxLength={120}
                />
              </label>
            </p>
            <p className="admin-search__actions">
              <button type="submit">Search</button>
              {q && (
                <Link className="op-quiet op-button" href="/admin/users">
                  Clear
                </Link>
              )}
            </p>
          </form>
          {accounts.length === 0 ? (
            <p role="status">{q ? "No accounts match that search." : "No accounts yet."}</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Google</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.name}</td>
                      <td>{a.email}</td>
                      <td>{a.role}</td>
                      <td>{a.googleLinked ? "Linked" : ""}</td>
                      <td>
                        <RoleActions actorRole={admin.role} actorId={admin.id} account={a} keepQ={keepQ} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
