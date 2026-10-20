import type { NextRequest } from "next/server";
import { guardSignedIn } from "@/lib/admin-mutation";
import { AVATAR_MAX_BYTES } from "@/lib/avatar";
import { seeOther } from "@/lib/http";
import { avatarStore } from "@/lib/services";

// Sets or removes the signed-in account's profile picture. Any role: members keep one too.
// The lab picks a new picture up the next time its owner opens the lab from this site.
export async function POST(req: NextRequest) {
  const gate = await guardSignedIn(req);
  if (gate instanceof Response) return gate;
  // Refuse an oversized body before parsing it; the form's own fields add a few hundred bytes.
  if (Number(req.headers.get("content-length") ?? 0) > AVATAR_MAX_BYTES + 16 * 1024) {
    return seeOther(req, "/account?error=avatar_size");
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return seeOther(req, "/account?error=avatar_type");
  }
  const store = avatarStore();
  if (form.get("remove") !== null) {
    await store.remove(gate.user.id);
    return seeOther(req, "/account?saved=avatar-removed");
  }
  const file = form.get("avatar");
  if (!(file instanceof File) || file.size === 0) return seeOther(req, "/account?error=avatar_missing");
  if (file.size > AVATAR_MAX_BYTES) return seeOther(req, "/account?error=avatar_size");
  const result = await store.save(gate.user.id, new Uint8Array(await file.arrayBuffer()));
  return seeOther(req, result.ok ? "/account?saved=avatar" : `/account?error=${result.error}`);
}
