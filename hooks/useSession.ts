"use client";

import { createContext, createElement, useContext, useReducer, useEffect, type ReactNode } from "react";
import { api, asApiError, newIdempotencyKey } from "@/lib/client/api";
import { CONCEPT_IDS } from "@/lib/contracts";
import type { ConceptId, RecordDTO, SessionDTO, ComparisonRowDTO } from "@/lib/contracts";

export interface SessionState extends Omit<SessionDTO, "attempts"> {
  recordHistory: RecordDTO[];
  attempts: SessionDTO["attempts"];
  activeAttemptId?: string;
  revealIndex: number;
  selectedConceptId?: ConceptId;
  selectedQuestionId?: string;
  comparison?: ComparisonRowDTO[];
  pending: { teach?: boolean; attempt?: boolean; complete?: boolean };
  voice: { enabled: boolean; speaking: boolean; listening: boolean };
  errors: Array<{ kind: "llm" | "network" | "conflict"; message: string }>;
}

export const CONCEPT_ORDER: ConceptId[] = [...CONCEPT_IDS];

export function emptyRecord(): RecordDTO {
  const concepts = {} as RecordDTO["concepts"];
  for (const id of CONCEPT_IDS) {
    concepts[id] = { state: "not_taught", evidence: [], conflicts: [], uncertain: false, reason: "not assessed" };
  }
  return { id: "record-0", version: 0, cycle: 1, rubricVersion: "1.0.2", concepts, misconceptions: {} };
}

function initial(sessionId: string): SessionState {
  return {
    sessionId, phase: "teaching", revision: 0, cycle: 1, messages: [], record: emptyRecord(),
    recordHistory: [], attempts: [], revealIndex: 0, pending: {},
    voice: { enabled: false, speaking: false, listening: false }, errors: [],
  };
}

type Action =
  | { type: "HYDRATED"; payload: SessionDTO }
  | { type: "PENDING"; payload: Partial<SessionState["pending"]> }
  | { type: "ERROR"; payload: SessionState["errors"][number] }
  | { type: "CLEAR_ERRORS" }
  | { type: "SELECT_CONCEPT"; payload: { conceptId?: ConceptId } }
  | { type: "SELECT_QUESTION"; payload: { questionId?: string } }
  | { type: "REVEAL_NEXT" }
  | { type: "SET_COMPARISON"; payload: ComparisonRowDTO[] };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "HYDRATED": {
      const dto = action.payload;
      const active = dto.attempts.at(-1);
      const total = active?.results.length ?? 0;
      const revealIndex = active?.status === "complete" ? total : Math.min(state.revealIndex, total);
      const lastVer = state.recordHistory.at(-1)?.version;
      const recordHistory = lastVer === dto.record.version ? state.recordHistory : [...state.recordHistory, dto.record];
      return {
        ...state, sessionId: dto.sessionId, phase: dto.phase, revision: dto.revision, cycle: dto.cycle,
        messages: dto.messages, record: dto.record, recordHistory, attempts: dto.attempts,
        activeAttemptId: active?.id, revealIndex, pending: {},
      };
    }
    case "PENDING":
      return { ...state, pending: { ...state.pending, ...action.payload } };
    case "ERROR":
      return { ...state, pending: {}, errors: [...state.errors.slice(-2), action.payload] };
    case "CLEAR_ERRORS":
      return { ...state, errors: [] };
    case "SELECT_CONCEPT":
      return { ...state, selectedConceptId: action.payload.conceptId, selectedQuestionId: undefined };
    case "SELECT_QUESTION":
      return { ...state, selectedQuestionId: action.payload.questionId, selectedConceptId: undefined };
    case "REVEAL_NEXT": {
      const active = state.attempts.find((a) => a.id === state.activeAttemptId);
      return { ...state, revealIndex: Math.min(state.revealIndex + 1, active?.results.length ?? 0) };
    }
    case "SET_COMPARISON":
      return { ...state, comparison: action.payload };
    default:
      return state;
  }
}

export interface SessionActions {
  hydrate(): Promise<void>;
  /** Dev-only: hydrate directly from a DTO (used behind the mocks flag). */
  hydrateFrom(dto: SessionDTO): void;
  teach(text: string): Promise<void>;
  retry(messageId: string): Promise<void>;
  assess(): Promise<void>;
  complete(attemptId: string): Promise<void>;
  selectConcept(id?: ConceptId): void;
  selectQuestion(id?: string): void;
  revealNext(): void;
  beginReteach(questionId: string, nextStepHint: string): Promise<void>;
}

interface Ctx { state: SessionState; actions: SessionActions }
const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, sessionId, initial);

  useEffect(() => {
    if (state.phase === "comparing" && !state.comparison) {
      api.getComparison(state.sessionId)
        .then((comp) => dispatch({ type: "SET_COMPARISON", payload: comp }))
        .catch(() => {});
    }
  }, [state.phase, state.comparison, state.sessionId]);

  // Recreated each render so callbacks always close over the current state; they
  // are only invoked from event handlers/effects, never read during render.
  const run = async (pendingKey: keyof SessionState["pending"], fn: () => Promise<SessionDTO>) => {
    dispatch({ type: "CLEAR_ERRORS" });
    dispatch({ type: "PENDING", payload: { [pendingKey]: true } });
    try {
      dispatch({ type: "HYDRATED", payload: await fn() });
    } catch (e) {
      const err = asApiError(e);
      if (err.status === 409) {
        try { dispatch({ type: "HYDRATED", payload: await api.getSession(state.sessionId) }); } catch { /* ignore */ }
        dispatch({ type: "ERROR", payload: { kind: "conflict", message: "State changed — resynced." } });
      } else {
        dispatch({ type: "ERROR", payload: { kind: err.status === 0 ? "network" : "llm", message: err.error ?? "error" } });
      }
    }
  };

  const actions: SessionActions = {
    hydrate: () => run("teach", () => api.getSession(state.sessionId)),
    hydrateFrom: (dto) => dispatch({ type: "HYDRATED", payload: dto }),
    teach: (text) => run("teach", () => api.submitTeaching(state.sessionId, { text, expectedRevision: state.revision, idempotencyKey: newIdempotencyKey() })),
    retry: (messageId) => run("teach", () => api.retry(state.sessionId, messageId, { expectedRevision: state.revision })),
    assess: () => run("attempt", () => api.createAttempt(state.sessionId, { expectedRevision: state.revision, idempotencyKey: newIdempotencyKey() })),
    complete: (attemptId) => run("complete", () => api.complete(attemptId, { sessionId: state.sessionId, expectedRevision: state.revision, idempotencyKey: newIdempotencyKey() })),
    selectConcept: (id) => dispatch({ type: "SELECT_CONCEPT", payload: { conceptId: id } }),
    selectQuestion: (id) => dispatch({ type: "SELECT_QUESTION", payload: { questionId: id } }),
    revealNext: () => dispatch({ type: "REVEAL_NEXT" }),
    beginReteach: (questionId, nextStepHint) => run("teach", () => api.reteach(state.sessionId, { questionId, nextStepHint, expectedRevision: state.revision, idempotencyKey: newIdempotencyKey() })),
  };

  return createElement(SessionContext.Provider, { value: { state, actions } }, children);
}

export function useSession(): Ctx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
