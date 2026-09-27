"use client";

import { createContext, createElement, useContext, useReducer, useEffect, useRef, type ReactNode } from "react";
import { apiErrorMessage, asApiError, newIdempotencyKey, api, type ApiError } from "@/lib/client/api";
import type { ConceptId, RecordDTO, SessionDTO, ComparisonRowDTO } from "@/lib/contracts";

export interface SessionState extends Omit<SessionDTO, "attempts"> {
  hydrated: boolean;
  recordHistory: RecordDTO[];
  attempts: SessionDTO["attempts"];
  activeAttemptId?: string;
  revealIndex: number;
  selectedConceptId?: ConceptId;
  selectedQuestionId?: string;
  comparison?: ComparisonRowDTO[];
  pending: { teach?: boolean; attempt?: boolean; complete?: boolean };
  voice: { enabled: boolean; speaking: boolean; listening: boolean };
  errors: Array<{ kind: "network" | "conflict" | "rate_limit" | "request"; message: string }>;
}

export function emptyRecord(): RecordDTO {
  const concepts = {} as RecordDTO["concepts"];
  return { id: "record-0", version: 0, cycle: 1, rubricVersion: "1.0.2", concepts, misconceptions: {} };
}

function initial(sessionId: string): SessionState {
  return {
    sessionId, topic: { id: "test", name: "Topic", rubricData: { concepts: [], misconceptions: [], questions: [] } }, phase: "teaching", revision: 0, cycle: 1, messages: [], record: emptyRecord(),
    hydrated: false, recordHistory: [], attempts: [], revealIndex: 0, pending: {},
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
  | { type: "SET_COMPARISON"; payload: ComparisonRowDTO[] }
  | { type: "SET_VOICE_ENABLED"; payload: boolean }
  | { type: "SET_SPEAKING"; payload: boolean };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "HYDRATED": {
      const dto = action.payload;
      const active = dto.attempts.at(-1);
      const total = active?.results.length ?? 0;
      const sameActiveAttempt = !!active && active.id === state.activeAttemptId;
      const revealIndex = active?.status === "complete" ? total : sameActiveAttempt ? Math.min(state.revealIndex, total) : 0;
      const lastVer = state.recordHistory.at(-1)?.version;
      const recordHistory = lastVer === dto.record.version ? state.recordHistory : [...state.recordHistory, dto.record];
      return {
        ...state, sessionId: dto.sessionId, topic: dto.topic, phase: dto.phase, revision: dto.revision, cycle: dto.cycle,
        messages: dto.messages, record: dto.record, recordHistory, attempts: dto.attempts,
        activeAttemptId: active?.id, revealIndex, comparison: dto.comparison, pending: {}, hydrated: true,
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
    case "SET_VOICE_ENABLED":
      return { ...state, voice: { ...state.voice, enabled: action.payload } };
    case "SET_SPEAKING":
      return { ...state, voice: { ...state.voice, speaking: action.payload } };
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
  toggleVoice(): void;
  playVoice(source: "learner_message" | "question_result", id: string): Promise<void>;
  stopVoice(): void;
  dismissErrors(): void;
}

interface Ctx { state: SessionState; actions: SessionActions }
const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, sessionId, initial);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayedRef = useRef<{ msgId?: string, revealIndex?: number }>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem("it_voice_enabled");
      if (stored === "true") dispatch({ type: "SET_VOICE_ENABLED", payload: true });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (state.phase === "comparing" && !state.comparison) {
      api.getComparison(state.sessionId)
        .then((comp) => dispatch({ type: "SET_COMPARISON", payload: comp }))
        .catch((cause: unknown) => {
          const error = asApiError(cause);
          dispatch({ type: "ERROR", payload: toSessionError(error, "Could not load the comparison.") });
        });
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
        try {
          dispatch({ type: "HYDRATED", payload: await api.getSession(state.sessionId) });
        } catch (syncCause: unknown) {
          dispatch({ type: "ERROR", payload: toSessionError(asApiError(syncCause), "State changed and the latest state could not be loaded.") });
          return;
        }
        dispatch({ type: "ERROR", payload: { kind: "conflict", message: "This session changed in another request. The latest state has been loaded." } });
      } else {
        dispatch({ type: "ERROR", payload: toSessionError(err) });
      }
    }
  };

  const actions: SessionActions = {
    hydrate: () => run("teach", () => api.getSession(state.sessionId)),
    hydrateFrom: (dto) => dispatch({ type: "HYDRATED", payload: dto }),
    teach: (text) => run("teach", () => api.submitTeaching(state.sessionId, { text, inputMode: "typed", expectedRevision: state.revision, idempotencyKey: newIdempotencyKey() })),
    retry: (messageId) => run("teach", () => api.retry(state.sessionId, messageId, { expectedRevision: state.revision })),
    assess: () => run("attempt", () => api.createAttempt(state.sessionId, { expectedRevision: state.revision, idempotencyKey: newIdempotencyKey() })),
    complete: (attemptId) => run("complete", () => api.complete(attemptId, { sessionId: state.sessionId, expectedRevision: state.revision, idempotencyKey: newIdempotencyKey() })),
    selectConcept: (id) => dispatch({ type: "SELECT_CONCEPT", payload: { conceptId: id } }),
    selectQuestion: (id) => dispatch({ type: "SELECT_QUESTION", payload: { questionId: id } }),
    revealNext: () => dispatch({ type: "REVEAL_NEXT" }),
    beginReteach: (questionId, nextStepHint) => run("teach", () => api.reteach(state.sessionId, { questionId, nextStepHint, expectedRevision: state.revision, idempotencyKey: newIdempotencyKey() })),
    toggleVoice: () => {
      const next = !state.voice.enabled;
      dispatch({ type: "SET_VOICE_ENABLED", payload: next });
      if (!next && audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        dispatch({ type: "SET_SPEAKING", payload: false });
      }
      try { localStorage.setItem("it_voice_enabled", String(next)); } catch { /* ignore */ }
    },
    playVoice: async (source, id) => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      dispatch({ type: "SET_SPEAKING", payload: true });
      try {
        const blob = await api.synthesizeSpeech(source, id);
        const audio = new Audio(URL.createObjectURL(blob));
        audioRef.current = audio;
        audio.onended = () => dispatch({ type: "SET_SPEAKING", payload: false });
        audio.onerror = () => dispatch({ type: "SET_SPEAKING", payload: false });
        await audio.play();
      } catch (e) {
        dispatch({ type: "SET_SPEAKING", payload: false });
        if (e instanceof Error && e.name !== "NotAllowedError") {
          dispatch({ type: "ERROR", payload: toSessionError(asApiError(e), "Voice synthesis failed.") });
        } else if (!(e instanceof Error)) {
          dispatch({ type: "ERROR", payload: toSessionError(asApiError(e), "Voice synthesis failed.") });
        }
      }
    },
    stopVoice: () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      dispatch({ type: "SET_SPEAKING", payload: false });
    },
    dismissErrors: () => dispatch({ type: "CLEAR_ERRORS" }),
  };

  useEffect(() => {
    if (!state.voice.enabled || state.voice.speaking) return;

    const lastMsg = state.messages.at(-1);
    if (lastMsg && lastMsg.role === "learner" && lastPlayedRef.current.msgId !== lastMsg.id) {
       lastPlayedRef.current.msgId = lastMsg.id;
       setTimeout(() => void actions.playVoice("learner_message", lastMsg.id), 0);
       return;
    }

    const active = state.attempts.find((a) => a.id === state.activeAttemptId);
    if (active && state.revealIndex > 0 && lastPlayedRef.current.revealIndex !== state.revealIndex) {
       lastPlayedRef.current.revealIndex = state.revealIndex;
       if (state.revealIndex <= active.results.length) {
         const rId = active.results[state.revealIndex - 1].id;
         setTimeout(() => void actions.playVoice("question_result", rId), 0);
       }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.messages, state.activeAttemptId, state.revealIndex, state.voice.enabled]);

  // eslint-disable-next-line react-hooks/refs
  return createElement(SessionContext.Provider, { value: { state, actions } }, children);
}

export function useSession(): Ctx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}

function toSessionError(error: ApiError, fallback?: string): SessionState["errors"][number] {
  const kind = error.status === 0
    ? "network"
    : error.status === 409
      ? "conflict"
      : error.status === 429
        ? "rate_limit"
        : "request";
  return { kind, message: apiErrorMessage(error, fallback) };
}
