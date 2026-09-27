import type { TeachingTopic } from "@/lib/contracts/topic";
import type { ValidatedEvaluation } from "./validate";
import type { StudentTurn } from "./provenance";
import type { EvaluationFailure } from "./budget";

/**
 * Evaluator port used by the service layer. One bounded call per submitted
 * explanation; the returned `evaluation` is already validated (Zod + exact-span
 * provenance). The service turns it into an immutable learning-record snapshot.
 *
 * NOTE: the field is named `evaluation` (a {@link ValidatedEvaluation}) rather
 * than `record`; "record" in this codebase means a versioned LearningRecord,
 * which only the service can build (it needs the previous version + cycle).
 */
export interface EvaluateArgs {
  sessionId: string;
  topic: TeachingTopic;
  turns: StudentTurn[];
  /** Optional external cancellation (e.g. request aborted). */
  signal?: AbortSignal;
}

export type EvaluationResult =
  | { ok: true; evaluation: ValidatedEvaluation; model: string; latencyMs: number; attempts: number }
  | { ok: false; reason: EvaluationFailure; attempts: number };

export interface Evaluator {
  evaluate(args: EvaluateArgs): Promise<EvaluationResult>;
}

export type { EvaluationFailure } from "./budget";
