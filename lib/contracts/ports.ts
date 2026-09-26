import type { EvaluatorOutput } from "./evaluator";
import type { LearningRecord } from "./record";
import type { QuestionResult } from "./assessment";
import type { SessionPhase } from "./session";
import type { AttemptDTO, SessionDTO } from "./dto";

/**
 * Ports (interfaces only — implementations arrive in Phase 3). These let the
 * pure Phase 2 logic and the Phase 3 routes depend on abstractions rather than
 * concrete providers (Gemini, Postgres, Date/crypto).
 */

/** Deterministic clock + id source, so pure logic and tests stay reproducible. */
export interface Clock {
  now(): Date;
}
export interface IdProvider {
  newId(): string;
}
export interface ClockIdProvider extends Clock, IdProvider {}

/** Evaluator adapter: the single bounded Gemini call, provider-agnostic. */
export interface EvaluatorInput {
  model: string;
  /** System instruction with rubric + misconception definitions, no student text mixed in. */
  systemInstruction: string;
  /** Student turns passed as a data block; the adapter must not treat them as instructions. */
  studentTurns: Array<{ turn_id: string; text: string }>;
}
export interface EvaluatorAdapter {
  /** One call per submitted explanation. Returns raw (unvalidated) structured output. */
  evaluate(input: EvaluatorInput): Promise<EvaluatorOutput>;
}

/** Result of an idempotent write: either freshly applied or replayed. */
export interface IdempotentResult<T> {
  replayed: boolean;
  value: T;
}

/**
 * Persistence repository. All mutations are owner-scoped, revision-checked, and
 * idempotent (ARCHITECTURE_REVISED §3, §4). Signatures are intentionally
 * high-level; concrete param/return refinement lands with the Drizzle
 * implementation in Phase 3.
 */
export interface SessionRepository {
  createSession(input: {
    topicId: string;
    ownerTokenHash: Uint8Array;
    rubricVersion: string;
  }): Promise<SessionDTO>;

  /** Full hydrate for GET /api/sessions/[id]. */
  getSession(input: {
    sessionId: string;
    ownerTokenHash: Uint8Array;
  }): Promise<SessionDTO | null>;

  /** tx1: insert pending student turn and bump revision. */
  appendStudentMessage(input: {
    sessionId: string;
    text: string;
    inputMode: "typed" | "voice";
    expectedRevision: number;
    idempotencyKey: string;
  }): Promise<IdempotentResult<{ messageId: string; turnNo: number; revision: number }>>;

  /** tx2: persist the validated record + learner probe, iff revision still valid. */
  finalizeEvaluation(input: {
    sessionId: string;
    sourceMessageId: string;
    expectedRevision: number;
    record: LearningRecord;
    probeId: string | null;
    evaluatorModel: string;
  }): Promise<{ stale: boolean; revision: number }>;

  markEvaluationFailed(input: {
    sessionId: string;
    messageId: string;
    error: string;
  }): Promise<void>;

  /** Compute + persist an attempt and all its results in one transaction. */
  createAttempt(input: {
    sessionId: string;
    expectedRevision: number;
    recordId?: string;
    idempotencyKey: string;
    results: QuestionResult[];
    formId: "recursion.A" | "recursion.B";
    formVersion: string;
    gateVersion: string;
    rubricVersion: string;
    learningRecordId: string;
  }): Promise<IdempotentResult<AttemptDTO>>;

  completeAttempt(input: {
    attemptId: string;
    sessionId: string;
    expectedRevision: number;
  }): Promise<{ attempt: AttemptDTO; phase: SessionPhase; revision: number }>;

  beginReteach(input: {
    sessionId: string;
    expectedRevision: number;
  }): Promise<{ phase: SessionPhase; cycle: number; revision: number }>;
}
