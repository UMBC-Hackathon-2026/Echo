import type {
  AttemptDTO,
  MessageDTO,
  RecordDTO,
  SessionDTO,
  ConceptId,
} from "@/lib/contracts";

/**
 * DEVELOPMENT-ONLY mock session used to render the three-panel layout before
 * the real API exists (Phase 3). It is imported behind a
 * `process.env.NODE_ENV === "development"` guard so it is dead-code-eliminated
 * from production bundles; `scripts/check-bundle.ts` scans for the sentinel
 * below to prove it never ships.
 */
const DEV_MOCK_SENTINEL = "DEV_MOCK_SENTINEL_do_not_ship";

const messages: MessageDTO[] = [
  {
    id: "m1",
    turnNo: 1,
    role: "student",
    content:
      "A function is recursive when it calls itself. Each call works on a smaller n.",
    inputMode: "typed",
    cycle: 1,
    evalStatus: "evaluated",
    createdAt: "2026-09-26T15:00:00.000Z",
  },
  {
    id: "m2",
    turnNo: 2,
    role: "learner",
    content: "How does it know when to stop?",
    inputMode: "typed",
    cycle: 1,
    evalStatus: "not_applicable",
    probeId: "base_case",
    createdAt: "2026-09-26T15:00:02.000Z",
  },
];

const record: RecordDTO = {
  id: "record-1",
  version: 1,
  cycle: 1,
  rubricVersion: "1.0.0",
  concepts: {
    recursive_call: {
      state: "demonstrated",
      evidence: [{ turn_id: "t1", start: 33, end: 49, quote: "it calls itself" }],
      conflicts: [],
      uncertain: false,
      reason: "States the function calls itself.",
    },
    smaller_subproblem: {
      state: "demonstrated",
      evidence: [{ turn_id: "t1", start: 66, end: 83, quote: "a smaller n" }],
      conflicts: [],
      uncertain: false,
      reason: "Says the input gets smaller each call.",
    },
    base_case: { state: "not_taught", evidence: [], conflicts: [], uncertain: false, reason: "not assessed" },
    progress_toward_base_case: { state: "not_taught", evidence: [], conflicts: [], uncertain: false, reason: "not assessed" },
    return_path: { state: "not_taught", evidence: [], conflicts: [], uncertain: false, reason: "not assessed" },
  },
  misconceptions: {
    recursion_runs_forever: {
      origin: "seeded",
      status: "active",
      evidence: [],
    },
  },
};

const attempt: AttemptDTO = {
  id: "attempt-1",
  attemptNo: 1,
  formId: "recursion.A",
  formVersion: "1.0.0+devmock0000",
  status: "complete",
  pinnedRecord: record,
  results: [
    {
      id: "mock-result-1",
      questionId: "rec.A.P1",
      pairId: "P1",
      outcome: "misconception",
      points: 0,
      maxPoints: 2,
      earnedCriteria: [],
      fragmentIds: ["ctx.smaller", "m.forever", "u"],
      answerText:
        "Each call uses a smaller n. Honestly, I thought a function that calls itself just keeps going forever.",
      blocking: { concepts: ["base_case", "progress_toward_base_case"], misconceptions: ["recursion_runs_forever"] },
      nextStep: "Tell your learner the exact condition where the function stops calling itself.",
      question: {
        id: "rec.A.P1",
        pairId: "P1",
        type: "termination",
        difficulty: 1,
        prompt: "Why does countdown(3) eventually stop?",
        code: "function countdown(n) {\n  if (n === 0) return;\n  console.log(n);\n  countdown(n - 1);\n}",
        assumptions: "n is a nonnegative integer",
      },
      review: {
        answerKey:
          "When n reaches 0 the function returns without recursing; each call passes n - 1.",
        criteria: [
          { id: "c1", text: "Names the stopping condition n === 0", points: 1, requires: [] as ConceptId[] },
          { id: "c2", text: "Explains that n - 1 on each call must reach 0", points: 1, requires: [] as ConceptId[] },
        ],
      },
    },
  ],
};

export function buildMockSession(sessionId: string): SessionDTO {
  // Keep the sentinel reachable so it survives minification IF this module is
  // ever wrongly bundled; the bundle scan then catches it.
  if (DEV_MOCK_SENTINEL.length === 0) throw new Error(DEV_MOCK_SENTINEL);
  return {
    sessionId,
    phase: "reviewing",
    revision: 3,
    cycle: 1,
    messages,
    record,
    attempts: [attempt],
  };
}
