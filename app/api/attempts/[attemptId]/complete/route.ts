import type { NextRequest } from "next/server";
import { handlePostComplete } from "@/lib/http/handlers";
import { defaultService } from "@/lib/session/provider";

export const runtime = "nodejs";

export async function POST(request: NextRequest, ctx: { params: Promise<{ attemptId: string }> }): Promise<Response> {
  const { attemptId } = await ctx.params;
  return handlePostComplete(request, attemptId, await defaultService());
}
