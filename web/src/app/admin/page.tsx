import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin-auth";
import { LabButton } from "@/components/LabButton";
import { canEditContent } from "@/lib/admin-mutation";
import { staffPermissions } from "@/lib/office-bridge";
import { canReadLeads } from "@/lib/session-service";
import { db } from "@/lib/db";
import { liveContent } from "@/lib/services";
import { canManageRoles } from "@/lib/staff-roles";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

const LEADS_PER_PAGE = 50;

type Props = { searchParams: Promise<{ page?: string; saved?: string; error?: string }> };

export default async function AdminPage({ searchParams }: Props) {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  // STAFF, EDITOR and ADMIN read enquiries. Only EDITOR and ADMIN see the content forms, the same
  // rule guardContentEdit applies to the posts.
  if (!canReadLeads(admin.role)) redirect("/account");
  const editor = canEditContent(admin.role);

  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const repo = liveContent();

  const [leads, leadCount, programs, people] = await Promise.all([
    db().lead.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * LEADS_PER_PAGE,
      take: LEADS_PER_PAGE,
    }),
    db().lead.count(),
    editor ? repo.listPublicPrograms() : [],
    editor ? repo.listPeople() : [],
  ]);
  const lastPage = Math.max(1, Math.ceil(leadCount / LEADS_PER_PAGE));

  return (
    <div className="operate">
      <div className="ccg-wrap">
        <div className="operate__bar">
          <div>
            <h1>Admin</h1>
            <p className="operate__who">
              Signed in as {admin.name} ({admin.role})
            </p>
          </div>
          <LabButton role={admin.role} />
          <p className="admin-links">
            <Link href="/account">Your account</Link>
            {canManageRoles(admin.role) && <Link href="/admin/users">Accounts</Link>}
            {staffPermissions(admin.role) && <Link href="/office/">Virtual office</Link>}
          </p>
          <form method="post" action="/admin/logout">
            <button type="submit" className="op-quiet">
              Sign out
            </button>
          </form>
        </div>
        {params.saved && <p role="status">Saved {params.saved}.</p>}
        {params.error === "lab" && (
          <p role="alert">CK Virtual Lab has no public address on this server yet, so the button cannot open it.</p>
        )}
        {params.error && params.error !== "lab" && <p role="alert">Not saved: {params.error}.</p>}

        <section className="admin-section">
          <h2>Leads ({leadCount})</h2>
          <p>PENDING and FAILED mean the notice email did not go out. Reply by hand.</p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Organization</th>
                  <th>Interest</th>
                  <th>Message</th>
                  <th>Email status</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td>{l.createdAt.toISOString()}</td>
                    <td>{l.name}</td>
                    <td>{l.email}</td>
                    <td>{l.phone}</td>
                    <td>{l.organization}</td>
                    <td>{l.interest}</td>
                    <td>{l.message}</td>
                    <td className={l.emailStatus === "SENT" ? undefined : "status-flag"}>
                      {l.emailStatus === "SENT" ? "SENT" : `${l.emailStatus} (needs a look)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="admin-pager">
            Page {page} of {lastPage}
            {page > 1 && (
              <>
                {" "}
                <Link href={`/admin?page=${page - 1}`}>Newer</Link>
              </>
            )}
            {page < lastPage && (
              <>
                {" "}
                <Link href={`/admin?page=${page + 1}`}>Older</Link>
              </>
            )}
          </p>
        </section>

        {editor && (
          <>
            <section className="admin-section">
              <h2>Programs</h2>
              <p>Summaries only. Program codes are fixed by the code and the database; there is no create.</p>
              <div className="admin-forms">
                {programs.map((p) => (
                  <form key={p.code} className="admin-form" method="post" action={`/admin/programs/${p.code}`}>
                    <h3>{p.title}</h3>
                    <p>
                      <label>
                        Summary
                        <br />
                        <textarea
                          name="summary"
                          defaultValue={p.summary}
                          rows={3}
                          cols={80}
                          required
                          maxLength={1000}
                        />
                      </label>
                    </p>
                    <p>
                      <button type="submit">Save {p.title}</button>
                    </p>
                  </form>
                ))}
              </div>
            </section>

            <section className="admin-section">
              <h2>People</h2>
              <div className="admin-forms">
                {people.map((person) => (
                  <form key={person.id} className="admin-form" method="post" action={`/admin/people/${person.id}`}>
                    <h3>{person.name}</h3>
                    <p>
                      <label>
                        Role (leave empty to hide the title line){" "}
                        <input name="role" defaultValue={person.role ?? ""} maxLength={120} />
                      </label>
                    </p>
                    <p>
                      <label>
                        Bio
                        <br />
                        <textarea name="bio" defaultValue={person.bio} rows={4} cols={80} maxLength={4000} />
                      </label>
                    </p>
                    <p>
                      <button type="submit">Save {person.name}</button>
                    </p>
                  </form>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
