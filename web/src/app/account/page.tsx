import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AvatarForm } from "@/components/AvatarForm";
import { LabButton } from "@/components/LabButton";
import { currentAdmin } from "@/lib/admin-auth";
import { AVATAR_MAX_BYTES, AVATAR_SIZE, avatarPath } from "@/lib/avatar";
import { env } from "@/lib/env";
import { avatarStore } from "@/lib/services";
import { NAME_MAX, PASSWORD_MIN, isStaffRole } from "@/lib/session-service";
import { canManageRoles } from "@/lib/staff-roles";

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };

// Every role keeps its own details here. Messages come from fixed codes, never from the query text.
const SAVED: Record<string, string> = {
  name: "Your name is saved.",
  password: "Your password is changed. Other signed-in devices were signed out.",
  "email-sent": "If that address is free, a 6-digit code is on its way to it. Enter it below.",
  email: "Your email is changed. The old address was told.",
  avatar: "Your picture is saved. CK Virtual Lab shows it the next time you open the lab from here.",
  "avatar-removed": "Your picture is removed. CK Virtual Lab drops it the next time you open the lab from here.",
};
const ERRORS: Record<string, string> = {
  invalid_name: `Enter your full name (up to ${NAME_MAX} characters).`,
  wrong_password: "The current password is incorrect.",
  weak_password: `Use a new password of at least ${PASSWORD_MIN} characters (72 bytes at most).`,
  invalid_email: "Enter a valid email address.",
  same_email: "That is already your email.",
  throttled: "A code was sent less than a minute ago. Check your inbox.",
  invalid_code: "That code is wrong or has expired. Ask for a new one.",
  email_taken: "That email now belongs to another account.",
  avatar_missing: "Choose a photo first.",
  avatar_type: "That file is not a photo this site can use. Choose a JPEG, PNG or WebP image.",
  avatar_size: `That picture is over ${AVATAR_MAX_BYTES / 1024} KB. Choose it again on this page so it can be shrunk, or pick a smaller one.`,
};

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words.length > 1 ? (words.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };

export default async function AccountPage({ searchParams }: Props) {
  const user = await currentAdmin();
  if (!user) redirect("/login");
  const params = await searchParams;
  const saved =
    params.saved === "email-sent" && !env().RESEND_API_KEY
      ? "This server has no email sender configured, so the code was not emailed."
      : params.saved
        ? SAVED[params.saved]
        : undefined;
  const error = params.error ? (ERRORS[params.error] ?? "Not saved.") : undefined;
  const pictured = await avatarStore().version(user.id);

  // The root layout already provides <main>; this page is an Operate surface on the paper field.
  return (
    <div className="operate">
      <div className="ccg-wrap">
        <div className="operate__bar">
          <div>
            <h1>Your account</h1>
            <p className="operate__who">
              Signed in as {user.name} ({user.email})
            </p>
          </div>
          <LabButton role={user.role} />
          {isStaffRole(user.role) && (
            <p className="admin-links">
              <Link href="/admin">Staff page</Link>
              {canManageRoles(user.role) && <Link href="/admin/users">Accounts</Link>}
            </p>
          )}
          <form method="post" action="/admin/logout">
            <button type="submit" className="op-quiet">
              Sign out
            </button>
          </form>
        </div>
        {saved && <p role="status">{saved}</p>}
        {error && <p role="alert">{error}</p>}

        <section className="admin-section">
          <h2>Your details</h2>
          <div className="admin-forms">
            <AvatarForm
              src={pictured ? avatarPath(user.id, pictured) : null}
              initials={initialsOf(user.name)}
              size={AVATAR_SIZE}
              maxBytes={AVATAR_MAX_BYTES}
            />

            <form className="admin-form" method="post" action="/account/name">
              <h3>Full name</h3>
              <p>
                <label>
                  Full name
                  <input name="name" defaultValue={user.name} required maxLength={NAME_MAX} autoComplete="name" />
                </label>
              </p>
              <p>
                <button type="submit">Save name</button>
              </p>
            </form>

            <form className="admin-form" method="post" action="/account/password">
              <h3>Password</h3>
              <p>
                <label>
                  Current password
                  <input name="current" type="password" required autoComplete="current-password" />
                </label>
              </p>
              <p>
                <label>
                  New password (at least {PASSWORD_MIN} characters)
                  <input name="next" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" />
                </label>
              </p>
              <p>
                Signed up with Google and never set one? <Link href="/forgot-password">Set it with an emailed code</Link>.
              </p>
              <p>
                <button type="submit">Change password</button>
              </p>
            </form>

            <div className="admin-form">
              <h3>Email</h3>
              <form method="post" action="/account/email" className="admin-form__step">
                <p>
                  <label>
                    New email
                    <input name="email" type="email" required autoComplete="email" />
                  </label>
                </p>
                <p>
                  <button type="submit">Send a code to the new email</button>
                </p>
              </form>
              <form method="post" action="/account/email/confirm" className="admin-form__step">
                <p>
                  <label>
                    Code from the new inbox
                    <input
                      name="code"
                      required
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      autoComplete="one-time-code"
                    />
                  </label>
                </p>
                <p>
                  <button type="submit">Confirm new email</button>
                </p>
              </form>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
