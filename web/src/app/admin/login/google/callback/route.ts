import type { NextRequest } from "next/server";
import { seeOther } from "@/lib/http";

export function GET(req: NextRequest) {
  const target = new URL("/login/google/callback", req.url);
  target.search = req.nextUrl.search;
  return seeOther(req, `${target.pathname}${target.search}`);
}
