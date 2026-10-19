import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { formText, guardContentEdit } from "@/lib/admin-mutation";
import { CACHE_TAGS } from "@/lib/content";
import { db } from "@/lib/db";
import { seeOther } from "@/lib/http";
import { isPublicPath } from "@/lib/publish-gate";

type Ctx = { params: Promise<{ code: string }> };

// Updates an existing program's summary. There is no handler that creates a program.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { code } = await params;
  if (!isPublicPath(code)) return Response.json({ error: "Not found" }, { status: 404 });

  const guard = await guardContentEdit(req);
  if (guard instanceof Response) return guard;

  const summary = formText(await req.formData(), "summary");
  if (!summary || summary.length > 1000) return seeOther(req, "/admin?error=summary must be 1-1000 characters");

  // Last write wins; v1 has no optimistic locking (TDD 5.3).
  const { count } = await db().program.updateMany({ where: { code }, data: { summary } });
  if (count === 0) return Response.json({ error: "Not found" }, { status: 404 });

  // Next request renders the new row; stale HTML is never served after a save.
  revalidateTag(CACHE_TAGS.programs, { expire: 0 });
  return seeOther(req, `/admin?saved=${code}`);
}
