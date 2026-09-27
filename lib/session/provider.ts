import "server-only";
import { GeminiEvaluator } from "@/lib/evaluator/gemini";
import { createSessionService, type SessionService } from "./service";

/**
 * Lazily-built service. Production always uses the real Gemini evaluator.
 *
 * For deterministic E2E, E2E_EVALUATOR=scripted selects a scripted evaluator —
 * but ONLY when NODE_ENV !== "production", through a guarded dynamic import.
 * In a production build `process.env.NODE_ENV` folds to "production", so this
 * branch is dead code and the scripted module is never imported or bundled
 * (proven by `scripts/check-bundle.ts`, which scans the build for its sentinel).
 */
let svc: SessionService | null = null;

export async function defaultService(): Promise<SessionService> {
  if (svc) return svc;
  if (process.env.NODE_ENV !== "production" && process.env.E2E_EVALUATOR === "scripted") {
    const { ScriptedEvaluator } = await import("@/lib/evaluator/scripted");
    svc = createSessionService({ evaluator: new ScriptedEvaluator() });
  } else {
    svc = createSessionService({ evaluator: new GeminiEvaluator() });
  }
  return svc;
}
