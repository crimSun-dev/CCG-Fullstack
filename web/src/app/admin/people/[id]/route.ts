import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { formText, guardContentEdit } from "@/lib/admin-mutation";
import { CACHE_TAGS } from "@/lib/content";
import { db } from "@/lib/db";
import { seeOther } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Edits a person's bio and nullable role. Contact details are not columns, so they cannot be set here.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });

  const guard = await guardContentEdit(req);
  if (guard instanceof Response) return guard;

  const form = await req.formData();
  const role = formText(form, "role");
  const bio = formText(form, "bio") ?? "";
  if ((role?.length ?? 0) > 120 || bio.length > 4000) return seeOther(req, "/admin?error=role or bio too long");

  const { count } = await db().person.updateMany({
    where: { id },
    // An empty role is stored as null, which hides the title line on the team page.
    data: { role: role ? role : null, bio },
  });
  if (count === 0) return Response.json({ error: "Not found" }, { status: 404 });

  revalidateTag(CACHE_TAGS.people, { expire: 0 });
  return seeOther(req, "/admin?saved=person");
}
