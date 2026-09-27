import type { DynamicQuestion } from "./dynamic-rubric";
import type { ConceptId, ConceptState } from "./concepts";
import type { Span } from "./record";
import type { Outcome, QuestionType } from "./assessment";

/**
 * Public DTOs returned to the client (ARCHITECTURE_REVISED §4, §6).
 *
 * Hard rule: nothing here exposes rubric definitions (demonstratedWhen /
 * partialWhen text), criteria internals, fragment tables, or answer keys UNTIL
 * an attempt is complete. Pre-completion question data is limited to
 * `PublicQuestion`; review-only material lives in the optional `review` field,
 * which mappers populate only after `POST /complete`.
 */

/** Safe question fields, shown while an attempt is in progress. */
export interface PublicQuestion {
  id: string;
  pairId: string;
  type: QuestionType | DynamicQuestion["type"];
  difficulty: number;
  prompt: string;
  code: string;
  assumptions: string;
}

/** Review-only material, present ONLY after the attempt is completed. */
export interface QuestionReview {
  answerKey: string;
  /** Generated grading guidance has no per-criterion point allocation. */
  guidance?: string[];
  criteria: Array<{ id: string; text: string; points: number; requires: ConceptId[] }>;
}

export interface QuestionResultDTO {
  id: string;
  questionId: string;
  pairId: string;
  outcome: Outcome;
  points: number;
  maxPoints: number;
  earnedCriteria: string[];
  fragmentIds: string[];
  answerText: string;
  blocking: { concepts: ConceptId[]; misconceptions: string[] };
  nextStep: string | null;
  question: PublicQuestion;
  /** Populated only once the attempt is complete. */
  review?: QuestionReview;
}

export interface AttemptDTO {
  id: string;
  attemptNo: 1 | 2;
  formId: string;
  formVersion: string;
  status: "in_progress" | "complete";
  results: QuestionResultDTO[];
  pinnedRecord: RecordDTO;
}

export interface MessageDTO {
  id: string;
  turnNo: number;
  role: "student" | "learner";
  content: string;
  inputMode: "typed" | "voice";
  cycle: number;
  evalStatus: "pending" | "evaluated" | "failed" | "not_applicable";
  evalError?: string;
  probeId?: string;
  createdAt: string;
}

/** Concept state for the concept map — student's own words only, no rubric text. */
export interface ConceptStateDTO {
  state: ConceptState;
  evidence: Span[];
  conflicts: Span[];
  uncertain: boolean;
  reason: string;
}

export interface MisconceptionDTO {
  origin: "seeded" | "student";
  status: "active" | "resolved";
  evidence: Span[];
}

export interface RecordDTO {
  id: string;
  version: number;
  cycle: number;
  rubricVersion: string;
  concepts: Record<ConceptId, ConceptStateDTO>;
  misconceptions: Record<string, MisconceptionDTO>;
}

export interface ComparisonRowDTO {
  pairId: string;
  type: QuestionType | DynamicQuestion["type"];
  before: { outcome: Outcome; points: number; maxPoints: number; answerText: string };
  after: { outcome: Outcome; points: number; maxPoints: number; answerText: string };
  conceptsBefore: Record<ConceptId, ConceptState>;
  conceptsAfter: Record<ConceptId, ConceptState>;
}

export interface SessionDTO {
  sessionId: string;
  topic: {
    id: string;
    name: string;
    rubricData: { concepts: Array<{ id: string; name?: string }>; misconceptions: Array<{ id: string; name?: string }>; questions: PublicQuestion[] };
  };
  phase:
    | "teaching"
    | "assessing"
    | "reviewing"
    | "reteaching"
    | "reassessing"
    | "comparing";
  revision: number;
  cycle: number;
  messages: MessageDTO[];
  record: RecordDTO;
  attempts: AttemptDTO[];
  comparison?: ComparisonRowDTO[];
}
