import type { NextRequest } from "next/server";
import { seeOther } from "@/lib/http";

export function GET(req: NextRequest) {
  return seeOther(req, "/login/google");
}
