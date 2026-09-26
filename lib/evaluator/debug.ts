import "server-only";
import { getDb } from "@/lib/db/client";
import { debugLlmPayloads } from "@/lib/db/schema";

/**
 * Store a raw evaluator payload ONLY when DEBUG_LLM_PAYLOADS=true, with an
 * expiry (§3). Debug logging must never break evaluation, so failures are
 * swallowed. Cleanup: scripts/cleanup-debug.ts.
 */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function maybeWriteDebugPayload(input: {
  sessionId: string;
  messageId?: string;
  raw: unknown;
}): Promise<void> {
  if (process.env.DEBUG_LLM_PAYLOADS !== "true") return;
  try {
    await getDb()
      .insert(debugLlmPayloads)
      .values({
        sessionId: input.sessionId,
        messageId: input.messageId ?? null,
        payload: { raw: input.raw },
        expiresAt: new Date(Date.now() + RETENTION_MS),
      });
  } catch {
    // never let debugging break the teach path
  }
}
