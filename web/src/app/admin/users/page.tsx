import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { canManageRoles, createStaffRoles } from "@/lib/staff-roles";

export const metadata: Metadata = { title: "Accounts", robots: { index: false, follow: false } };

const SAVED: Record<string, string> = { granted: "Staff granted.", cleared: "Staff cleared and removed from CK Virtual Lab." };
const ERRORS: Record<string, string> = {
  self: "You cannot change your own role.",
  fixed_role: "ADMIN and EDITOR come from the staff command and are not changed here.",
  lab_unreached: "Staff cleared, but CK Virtual Lab could not be reached, so their name is still there.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { searchParams: Promise<{ saved?: string; error?: string; id?: string }> };

// Every registered account, for an ADMIN to grant or clear STAFF. Anyone else gets a 404, so the
// list's existence is not advertised either.
export default async function UsersPage({ searchParams }: Props) {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  if (!canManageRoles(admin.role)) notFound();

  const params = await searchParams;
  const accounts = await createStaffRoles(db()).list();

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
            <input type="hidden" name="staff" value="false" />
            <button type="submit">Remove from CK Virtual Lab again</button>
          </form>
        )}

        <section className="admin-section">
          <h2>Registered accounts ({accounts.length})</h2>
          <p>
            STAFF can read every enquiry and enter CK Virtual Lab. It changes at once, without a new sign-in. Clearing
            STAFF also removes the person from CK Virtual Lab, with their notes and bookings there.
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Google</th>
                  <th>Staff</th>
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
                      {a.id === admin.id || (a.role !== "MEMBER" && a.role !== "STAFF") ? (
                        ""
                      ) : (
                        <form method="post" action={`/admin/users/${a.id}`}>
                          <input type="hidden" name="staff" value={a.role === "STAFF" ? "false" : "true"} />
                          <button type="submit" className={a.role === "STAFF" ? "op-quiet" : undefined}>
                            {a.role === "STAFF" ? "Clear staff" : "Make staff"}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
