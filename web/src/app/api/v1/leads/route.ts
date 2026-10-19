import type { NextRequest } from "next/server";
import { isHtmlFormPost, requestMeta, seeOther } from "@/lib/http";
import { RATE_LIMIT_WINDOW_MS, type LeadReceipt } from "@/lib/lead-service";
import { leadService } from "@/lib/services";

// The only public write. JSON callers get 202 | 400 | 429. A browser posting the plain HTML form
// (JavaScript off) gets a 303 back to /contact with the outcome, so it never lands on raw JSON.
export async function POST(req: NextRequest) {
  const htmlForm = isHtmlFormPost(req);
  const input = htmlForm ? fromForm(await req.formData()) : await req.json().catch(() => null);
  const receipt = await leadService().submit(input, requestMeta(req));

  if (htmlForm) return seeOther(req, `/contact?lead=${receipt.ok ? "sent" : receipt.error}`);
  return toJson(receipt);
}

function fromForm(form: FormData): Record<string, unknown> {
  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  return {
    name: text("name") ?? "",
    email: text("email") ?? "",
    phone: text("phone"),
    organization: text("organization"),
    interest: text("interest") ?? "general",
    message: text("message"),
    consent: form.get("consent") === "true",
    companyWebsite: text("companyWebsite"),
  };
}

function toJson(receipt: LeadReceipt): Response {
  if (receipt.ok) return Response.json({ ok: true }, { status: 202 });
  if (receipt.error === "RATE_LIMITED") {
    return Response.json(
      { error: receipt.error },
      { status: 429, headers: { "Retry-After": String(RATE_LIMIT_WINDOW_MS / 1000) } },
    );
  }
  return Response.json({ error: receipt.error }, { status: 400 });
}
