import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin-auth";
import { homeForRole } from "@/lib/session-service";

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const user = await currentAdmin();
  if (!user) redirect("/login");
  if (homeForRole(user.role) === "/admin") redirect("/admin");

  // The root layout already provides <main>; this page is an Operate surface on the paper field.
  return (
    <div className="operate">
      <div className="ccg-wrap">
        <div className="operate__bar">
          <div>
            <h1>Your account</h1>
            <p className="operate__who">Signed in as {user.name}</p>
          </div>
          <form method="post" action="/admin/logout">
            <button type="submit" className="op-quiet">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
