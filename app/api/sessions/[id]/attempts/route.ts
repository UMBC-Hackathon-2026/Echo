import type { NextRequest } from "next/server";
import { handlePostAttempts } from "@/lib/http/handlers";
import { defaultService } from "@/lib/session/provider";

export const runtime = "nodejs";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return handlePostAttempts(request, id, await defaultService());
}
