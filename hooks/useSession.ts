"use client";

import {
  createContext,
  createElement,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { CONCEPT_IDS } from "@/lib/contracts";
import type {
  ConceptId,
  RecordDTO,
  SessionAction,
  SessionState,
} from "@/lib/contracts";

/**
 * Session store (ARCHITECTURE_REVISED §6). One reducer owns the session; the
 * server response is always the truth, so the reducer never computes concept
 * states or scores itself. Phase 1 hydrates from a dev-only mock; Phase 3 will
 * hydrate from GET /api/sessions/[id].
 */

export function emptyRecord(): RecordDTO {
  const concepts = {} as RecordDTO["concepts"];
  for (const id of CONCEPT_IDS) {
    concepts[id] = { state: "not_taught", evidence: [], conflicts: [], uncertain: false, reason: "not assessed" };
  }
  return { id: "record-0", version: 0, cycle: 1, rubricVersion: "1.0.0", concepts, misconceptions: {} };
}

export function initialSessionState(sessionId: string): SessionState {
  return {
    sessionId,
    phase: "teaching",
    revision: 0,
    cycle: 1,
    messages: [],
    record: emptyRecord(),
    recordHistory: [],
    attempts: [],
    revealIndex: 0,
    pending: {},
    voice: { enabled: false, speaking: false, listening: false },
    errors: [],
  };
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "HYDRATED": {
      const dto = action.payload;
      const activeAttempt = dto.attempts.at(-1);
      return {
        ...state,
        sessionId: dto.sessionId,
        phase: dto.phase,
        revision: dto.revision,
        cycle: dto.cycle,
        messages: dto.messages,
        record: dto.record,
        recordHistory: [dto.record],
        attempts: dto.attempts,
        activeAttemptId: activeAttempt?.id,
        revealIndex: activeAttempt?.results.length ?? 0,
      };
    }
    case "TEACH_OK":
      return {
        ...state,
        revision: action.payload.revision,
        record: action.payload.record,
        recordHistory: [...state.recordHistory, action.payload.record],
        messages: [
          ...state.messages,
          action.payload.studentMsg,
          ...(action.payload.learnerMsg ? [action.payload.learnerMsg] : []),
        ],
        pending: { ...state.pending, teach: false },
      };
    case "TEACH_FAILED":
      return {
        ...state,
        messages: [...state.messages, action.payload.studentMsg],
        errors: [...state.errors, { kind: "llm", message: action.payload.error }],
        pending: { ...state.pending, teach: false },
      };
    case "ATTEMPT_STARTED":
      return {
        ...state,
        phase: action.payload.phase,
        revision: action.payload.revision,
        attempts: [...state.attempts, action.payload.attempt],
        activeAttemptId: action.payload.attempt.id,
        revealIndex: 0,
        pending: { ...state.pending, attempt: false },
      };
    case "ATTEMPT_COMPLETED":
      return {
        ...state,
        phase: action.payload.phase,
        revision: action.payload.revision,
        attempts: state.attempts.map((a) =>
          a.id === action.payload.attempt.id ? action.payload.attempt : a,
        ),
        pending: { ...state.pending, complete: false },
      };
    case "RETEACH_STARTED":
      return {
        ...state,
        phase: action.payload.phase,
        cycle: action.payload.cycle,
        revision: action.payload.revision,
        pending: { ...state.pending, reteach: false },
      };
    case "COMPARISON_OK":
      return state; // comparison rendering lands in Phase 4
    case "SELECT_CONCEPT":
      return { ...state, selectedConceptId: action.payload.conceptId };
    case "SELECT_QUESTION":
      return { ...state, selectedQuestionId: action.payload.questionId };
    case "REVEAL_NEXT": {
      const active = state.attempts.find((a) => a.id === state.activeAttemptId);
      const max = active?.results.length ?? 0;
      return { ...state, revealIndex: Math.min(state.revealIndex + 1, max) };
    }
    default:
      return state;
  }
}

interface SessionContextValue {
  state: SessionState;
  dispatch: Dispatch<SessionAction>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  sessionId,
  children,
}: {
  sessionId: string;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(sessionReducer, sessionId, initialSessionState);
  return createElement(SessionContext.Provider, { value: { state, dispatch } }, children);
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}

export const CONCEPT_ORDER: ConceptId[] = [...CONCEPT_IDS];
