import type { NextRequest } from "next/server";
import { handlePostSessions } from "@/lib/http/handlers";
import { defaultService } from "@/lib/session/provider";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  return handlePostSessions(request, await defaultService());
}
