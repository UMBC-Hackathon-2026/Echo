import "server-only";
import { GeminiEvaluator } from "@/lib/evaluator/gemini";
import { createSessionService, type SessionService } from "./service";

/** Lazily-built production service (real Gemini + default DATABASE_URL pool). */
let svc: SessionService | null = null;
export function defaultService(): SessionService {
  if (!svc) svc = createSessionService({ evaluator: new GeminiEvaluator() });
  return svc;
}
