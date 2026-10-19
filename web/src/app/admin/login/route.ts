import type { NextRequest } from "next/server";
import { seeOther } from "@/lib/http";

// The visitor sign-in lives at /login. This path remains so older links still arrive there.
export function GET(req: NextRequest) {
  return seeOther(req, "/login");
}

export function POST(req: NextRequest) {
  return seeOther(req, "/login");
}
