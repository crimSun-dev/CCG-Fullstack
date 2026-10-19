"use client";

import { useState } from "react";
import { Arrow } from "@/components/Arrow";
import { LEAD_RECEIPT } from "@/content/deck-copy";

type Option = { value: string; label: string };

const ERRORS: Record<string, string> = {
  NO_CONSENT: "Please tick the consent box so we can store your enquiry.",
  INVALID: "Please check your name, email, and message length.",
  RATE_LIMITED: "Too many attempts from this connection. Please try again in a few minutes.",
};

// A real <form method="post"> that works with JavaScript off. With JavaScript on, it posts JSON
// and shows the receipt in place. It holds no content state and no token.
export function LeadForm(props: { interests: Option[]; defaultInterest?: string; initialStatus?: string }) {
  const [status, setStatus] = useState<string | undefined>(props.initialStatus);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    try {
      const res = await fetch("/api/v1/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone") || undefined,
          organization: data.get("organization") || undefined,
          interest: data.get("interest"),
          message: data.get("message") || undefined,
          consent: data.get("consent") === "true",
          companyWebsite: data.get("companyWebsite") || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus(res.status === 202 ? "sent" : (body.error ?? "INVALID"));
    } catch {
      setStatus("NETWORK");
    } finally {
      setPending(false);
    }
  }

  if (status === "sent") return <p role="status" className="lead-receipt">{LEAD_RECEIPT}</p>;

  return (
    <form className="lead-form" method="post" action="/api/v1/leads" onSubmit={onSubmit}>
      {status && (
        <p role="alert">{ERRORS[status] ?? "Something went wrong. Please try again or email us directly."}</p>
      )}
      <div className="lead-form__row">
      <p>
        <label>
          Name <input name="name" required maxLength={120} autoComplete="name" />
        </label>
      </p>
      <p>
        <label>
          Email <input name="email" type="email" required autoComplete="email" />
        </label>
      </p>
      </div>
      <div className="lead-form__row">
      <p>
        <label>
          Phone (optional) <input name="phone" type="tel" maxLength={40} autoComplete="tel" />
        </label>
      </p>
      <p>
        <label>
          Organization (optional) <input name="organization" maxLength={200} autoComplete="organization" />
        </label>
      </p>
      </div>
      <p>
        <label>
          Interested in{" "}
          <select name="interest" defaultValue={props.defaultInterest ?? "general"}>
            {props.interests.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </p>
      <p>
        <label>
          Message (optional) <textarea name="message" maxLength={2000} rows={5} />
        </label>
      </p>
      {/* Honeypot: hidden from people, filled by naive bots. */}
      <p hidden aria-hidden="true">
        <label>
          Company website <input name="companyWebsite" tabIndex={-1} autoComplete="off" />
        </label>
      </p>
      <p>
        <label className="lead-form__consent">
          <input name="consent" type="checkbox" value="true" required />
          <span>
            I agree that CK Coaching Group may store these details to reply to my enquiry. See the{" "}
            <a href="/privacy">privacy note</a>.
          </span>
        </label>
      </p>
      <p>
        <button type="submit" className="btn btn--primary" disabled={pending}>
          <span>{pending ? "Sending…" : "Send enquiry"}</span>
          <Arrow />
        </button>
      </p>
    </form>
  );
}
