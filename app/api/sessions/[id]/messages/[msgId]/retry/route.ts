import type { NextRequest } from "next/server";
import { handlePostRetry } from "@/lib/http/handlers";
import { defaultService } from "@/lib/session/provider";

export const runtime = "nodejs";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string; msgId: string }> }): Promise<Response> {
  const { id, msgId } = await ctx.params;
  return handlePostRetry(request, id, msgId, defaultService());
}
