import type { NextRequest } from "next/server";
import { handleGetComparison } from "@/lib/http/handlers";
import { defaultService } from "@/lib/session/provider";

export const runtime = "nodejs";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return handleGetComparison(request, id, defaultService());
}
