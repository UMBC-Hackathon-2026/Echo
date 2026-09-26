import { z } from "zod";
import type { ConceptId } from "./concepts";
import type { LearningRecord } from "./record";
import type {
  AttemptDTO,
  ComparisonRowDTO,
  MessageDTO,
  RecordDTO,
  SessionDTO,
} from "./dto";

/** Server-enforced session phases (ARCHITECTURE_REVISED §3, §4). */
export const SessionPhase = z.enum([
  "teaching",
  "assessing",
  "reviewing",
  "reteaching",
  "reassessing",
  "comparing",
]);
export type SessionPhase = z.infer<typeof SessionPhase>;

export type Message = MessageDTO;
export type Attempt = AttemptDTO;

/**
 * Reducer store shape (ARCHITECTURE_REVISED §6). One page, one reducer. The
 * server response is always the truth; the reducer never computes concept
 * states or scores itself.
 */
export interface SessionState {
  sessionId: string;
  phase: SessionPhase;
  revision: number;
  cycle: number;
  messages: Message[];
  record: RecordDTO; // latest evaluated snapshot (public-safe view)
  recordHistory: RecordDTO[]; // for concept map "changed" badges
  attempts: Attempt[];
  activeAttemptId?: string;
  revealIndex: number; // how many persisted answers are shown
  selectedConceptId?: ConceptId; // cross-panel highlight
  selectedQuestionId?: string;
  pending: {
    teach?: boolean;
    attempt?: boolean;
    complete?: boolean;
    reteach?: boolean;
  };
  voice: { enabled: boolean; speaking: boolean; listening: boolean };
  errors: { kind: "llm" | "network" | "mic" | "conflict"; message: string }[];
}

/**
 * Actions mirror API responses one-to-one, plus UI-only actions. The `record`
 * carried by TEACH_OK is the public-safe RecordDTO; the full immutable
 * {@link LearningRecord} lives server-side.
 */
export type SessionAction =
  | { type: "HYDRATED"; payload: SessionDTO }
  | {
      type: "TEACH_OK";
      payload: {
        studentMsg: MessageDTO;
        learnerMsg: MessageDTO | null;
        record: RecordDTO;
        revision: number;
      };
    }
  | {
      type: "TEACH_FAILED";
      payload: { studentMsg: MessageDTO; error: string; revision?: number };
    }
  | {
      type: "ATTEMPT_STARTED";
      payload: { attempt: AttemptDTO; phase: SessionPhase; revision: number };
    }
  | {
      type: "ATTEMPT_COMPLETED";
      payload: { attempt: AttemptDTO; phase: SessionPhase; revision: number };
    }
  | {
      type: "RETEACH_STARTED";
      payload: { phase: SessionPhase; cycle: number; revision: number };
    }
  | { type: "COMPARISON_OK"; payload: { comparison: ComparisonRowDTO[] } }
  | { type: "SELECT_CONCEPT"; payload: { conceptId?: ConceptId } }
  | { type: "SELECT_QUESTION"; payload: { questionId?: string } }
  | { type: "REVEAL_NEXT" };

/** Kept for the (future) server type; the client holds RecordDTO. */
export type ServerLearningRecord = LearningRecord;
