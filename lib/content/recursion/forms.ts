import "server-only";
import { createHash } from "node:crypto";
import type { Form, Question, Fragment } from "@/lib/contracts";
import { RUBRIC_VERSION } from "./rubric";
import { SEEDED_MISCONCEPTIONS } from "./misconceptions";

/**
 * Frozen assessment forms A and B (ARCHITECTURE_REVISED §5). Authored
 * independently of any student explanation. Each criterion is worth 1 point.
 * All code samples assume `n` is a nonnegative integer and lists/strings are
 * finite. Every question follows the shape of `rec.A.P1` in §5.
 *
 * Server-only: answer keys, criteria and fragments never reach the client.
 */

const M_FOREVER = "recursion_runs_forever";

// Shared next-step hints, keyed by the concept/misconception a question blocks.
const NEXT_STEP = {
  recursive_call: "Point out where the function calls itself.",
  smaller_subproblem: "Explain what changes about the input on every call.",
  base_case: "Tell your learner the exact condition where the function stops calling itself.",
  progress_toward_base_case:
    "Explain why getting smaller guarantees it reaches that stopping condition.",
  return_path:
    "Explain how each call's result comes back and is combined by the earlier call.",
  recursion_runs_forever:
    "Your learner still believes self-calling functions never stop. Show it what makes this one stop.",
} as const;

function nextStepFor(keys: Array<keyof typeof NEXT_STEP>): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, NEXT_STEP[k]]));
}

const UNCERTAIN: Fragment = {
  id: "u",
  kind: "uncertain",
  requires: [],
  text: "I am not sure. I do not think you have told me about that yet.",
};

// ---------------------------------------------------------------------------
// Form A
// ---------------------------------------------------------------------------

const A_P1: Question = {
  id: "rec.A.P1",
  pairId: "P1",
  type: "termination",
  difficulty: 1,
  steps: 2,
  prompt: "Why does countdown(3) eventually stop?",
  code: "function countdown(n) {\n  if (n === 0) return;\n  console.log(n);\n  countdown(n - 1);\n}",
  assumptions: "n is a nonnegative integer",
  relevantMisconceptions: [M_FOREVER],
  criteria: [
    {
      id: "c1",
      text: "Names the stopping condition n === 0",
      points: 1,
      requires: ["base_case"],
      contradictedBy: [M_FOREVER],
    },
    {
      id: "c2",
      text: "Explains that n - 1 on each call must reach 0",
      points: 1,
      requires: ["smaller_subproblem", "progress_toward_base_case"],
      contradictedBy: [M_FOREVER],
    },
  ],
  fragments: [
    {
      id: "ctx.smaller",
      kind: "context",
      text: "Each call uses a smaller n.",
      requires: [{ concept: "smaller_subproblem", min: "demonstrated" }],
    },
    {
      id: "f.c2",
      kind: "fact",
      supportsCriterion: "c2",
      text: "Taking 1 away each time means n has to reach 0 eventually.",
      requires: [
        { concept: "smaller_subproblem", min: "demonstrated" },
        { concept: "progress_toward_base_case", min: "demonstrated" },
      ],
    },
    {
      id: "f.c1",
      kind: "fact",
      supportsCriterion: "c1",
      text: "When n is 0, the if-check returns without calling again, so it stops.",
      requires: [{ concept: "base_case", min: "demonstrated" }],
    },
    {
      id: "h.base",
      kind: "hedge",
      exactState: "partially_taught",
      text: "I think it has to stop somewhere, but I am not sure where.",
      requires: [{ concept: "base_case", min: "partially_taught" }],
    },
    {
      id: "m.forever",
      kind: "misconception",
      misconception: M_FOREVER,
      requires: [],
      text: "Honestly, I thought a function that calls itself just keeps going forever.",
    },
    UNCERTAIN,
  ],
  answerKey:
    "When n reaches 0 the function returns without recursing. Each call passes n - 1, so starting from a nonnegative integer, n always reaches 0.",
  nextStep: nextStepFor([
    "base_case",
    "progress_toward_base_case",
    "smaller_subproblem",
    "recursion_runs_forever",
  ]),
};

const A_P2: Question = {
  id: "rec.A.P2",
  pairId: "P2",
  type: "trace",
  difficulty: 2,
  steps: 3,
  prompt: "What does factorial(3) return?",
  code: "function factorial(n) {\n  if (n === 0) return 1;\n  return n * factorial(n - 1);\n}",
  assumptions: "n is a nonnegative integer",
  relevantMisconceptions: [],
  criteria: [
    { id: "c1", text: "Names the base value returned at n === 0 (1)", points: 1, requires: ["base_case"] },
    { id: "c2", text: "Explains results combine on the way back up", points: 1, requires: ["return_path", "recursive_call"] },
    { id: "c3", text: "Concludes the final value is 6", points: 1, requires: ["base_case", "return_path", "recursive_call"] },
  ],
  fragments: [
    {
      id: "f.c1",
      kind: "fact",
      supportsCriterion: "c1",
      text: "At n = 0 it returns 1 without calling again.",
      requires: [{ concept: "base_case", min: "demonstrated" }],
    },
    {
      id: "f.c2",
      kind: "fact",
      supportsCriterion: "c2",
      text: "Each call multiplies n by the value the smaller call returns.",
      requires: [
        { concept: "return_path", min: "demonstrated" },
        { concept: "recursive_call", min: "demonstrated" },
      ],
    },
    {
      id: "f.c3",
      kind: "fact",
      supportsCriterion: "c3",
      text: "So factorial(3) is 3 * 2 * 1 * 1 = 6.",
      requires: [
        { concept: "base_case", min: "demonstrated" },
        { concept: "return_path", min: "demonstrated" },
        { concept: "recursive_call", min: "demonstrated" },
      ],
    },
    {
      id: "h.return",
      kind: "hedge",
      exactState: "partially_taught",
      text: "The calls return something, but I am not sure how they combine.",
      requires: [{ concept: "return_path", min: "partially_taught" }],
    },
    UNCERTAIN,
  ],
  answerKey:
    "factorial(3) returns 6: it computes 3 * 2 * 1 * 1, where factorial(0) returns 1 as the base value and each call multiplies by the smaller result.",
  nextStep: nextStepFor(["base_case", "return_path", "recursive_call"]),
};

const A_P3: Question = {
  id: "rec.A.P3",
  pairId: "P3",
  type: "non-progress",
  difficulty: 2,
  steps: 2,
  prompt: "What happens when countdown(3) calls countdown(n + 1) instead?",
  code: "function countdown(n) {\n  if (n === 0) return;\n  console.log(n);\n  countdown(n + 1);\n}",
  assumptions: "n is a nonnegative integer",
  relevantMisconceptions: [M_FOREVER],
  criteria: [
    {
      id: "c1",
      text: "Explains n + 1 moves the input away from 0",
      points: 1,
      requires: ["smaller_subproblem", "progress_toward_base_case"],
      contradictedBy: [M_FOREVER],
    },
    {
      id: "c2",
      text: "Concludes the base case is never reached and the stack overflows",
      points: 1,
      requires: ["base_case", "progress_toward_base_case"],
      contradictedBy: [M_FOREVER],
    },
  ],
  fragments: [
    {
      id: "f.c1",
      kind: "fact",
      supportsCriterion: "c1",
      text: "Adding 1 each time moves n away from 0, not toward it.",
      requires: [
        { concept: "smaller_subproblem", min: "demonstrated" },
        { concept: "progress_toward_base_case", min: "demonstrated" },
      ],
    },
    {
      id: "f.c2",
      kind: "fact",
      supportsCriterion: "c2",
      text: "Since n never becomes 0, the stop condition is never hit and the stack overflows.",
      requires: [
        { concept: "base_case", min: "demonstrated" },
        { concept: "progress_toward_base_case", min: "demonstrated" },
      ],
    },
    {
      id: "h.base",
      kind: "hedge",
      exactState: "partially_taught",
      text: "I think there is meant to be a stopping point, but I am not sure it is reached.",
      requires: [{ concept: "base_case", min: "partially_taught" }],
    },
    {
      id: "m.forever",
      kind: "misconception",
      misconception: M_FOREVER,
      requires: [],
      text: "Honestly, I thought a function that calls itself just keeps going forever.",
    },
    UNCERTAIN,
  ],
  answerKey:
    "It never stops: n + 1 moves away from 0, so n === 0 is never true and the calls pile up until the stack overflows.",
  nextStep: nextStepFor([
    "smaller_subproblem",
    "progress_toward_base_case",
    "base_case",
    "recursion_runs_forever",
  ]),
};

const A_P4: Question = {
  id: "rec.A.P4",
  pairId: "P4",
  type: "transfer",
  difficulty: 3,
  steps: 2,
  prompt: "How could listLength(xs) be written to count items recursively?",
  code: "function listLength(xs) {\n  if (xs.length === 0) return 0;\n  return 1 + listLength(xs.slice(1));\n}",
  assumptions: "xs is a finite list",
  relevantMisconceptions: [],
  criteria: [
    { id: "c1", text: "Calls itself on the rest of the input", points: 1, requires: ["recursive_call", "smaller_subproblem"] },
    { id: "c2", text: "Returns 0 for the empty input", points: 1, requires: ["base_case"] },
    { id: "c3", text: "Adds 1 to the count the smaller call returns", points: 1, requires: ["return_path"] },
  ],
  fragments: [
    {
      id: "f.c1",
      kind: "fact",
      supportsCriterion: "c1",
      text: "It calls itself on the list without the first item.",
      requires: [
        { concept: "recursive_call", min: "demonstrated" },
        { concept: "smaller_subproblem", min: "demonstrated" },
      ],
    },
    {
      id: "f.c2",
      kind: "fact",
      supportsCriterion: "c2",
      text: "An empty list returns 0.",
      requires: [{ concept: "base_case", min: "demonstrated" }],
    },
    {
      id: "f.c3",
      kind: "fact",
      supportsCriterion: "c3",
      text: "It adds 1 to whatever the shorter list returns.",
      requires: [{ concept: "return_path", min: "demonstrated" }],
    },
    {
      id: "h.base",
      kind: "hedge",
      exactState: "partially_taught",
      text: "I think the empty list is the stopping point, but I am not certain what it returns.",
      requires: [{ concept: "base_case", min: "partially_taught" }],
    },
    UNCERTAIN,
  ],
  answerKey:
    "Return 0 for an empty list; otherwise return 1 + listLength(rest), so each call handles one fewer item until the list is empty.",
  nextStep: nextStepFor(["recursive_call", "smaller_subproblem", "base_case", "return_path"]),
};

// ---------------------------------------------------------------------------
// Form B (matched to A on pair id, type, criteria concept sets, steps, difficulty)
// ---------------------------------------------------------------------------

const B_P1: Question = {
  id: "rec.B.P1",
  pairId: "P1",
  type: "termination",
  difficulty: 1,
  steps: 2,
  prompt: "Why does printStars(3) eventually stop?",
  code: "function printStars(n) {\n  if (n === 0) return;\n  console.log('*');\n  printStars(n - 1);\n}",
  assumptions: "n is a nonnegative integer",
  relevantMisconceptions: [M_FOREVER],
  criteria: [
    { id: "c1", text: "Names the stopping condition n === 0", points: 1, requires: ["base_case"], contradictedBy: [M_FOREVER] },
    {
      id: "c2",
      text: "Explains that n - 1 on each call must reach 0",
      points: 1,
      requires: ["smaller_subproblem", "progress_toward_base_case"],
      contradictedBy: [M_FOREVER],
    },
  ],
  fragments: [
    {
      id: "ctx.smaller",
      kind: "context",
      text: "Each call uses a smaller n.",
      requires: [{ concept: "smaller_subproblem", min: "demonstrated" }],
    },
    {
      id: "f.c2",
      kind: "fact",
      supportsCriterion: "c2",
      text: "Taking 1 away each time means n has to reach 0 eventually.",
      requires: [
        { concept: "smaller_subproblem", min: "demonstrated" },
        { concept: "progress_toward_base_case", min: "demonstrated" },
      ],
    },
    {
      id: "f.c1",
      kind: "fact",
      supportsCriterion: "c1",
      text: "When n is 0, the if-check returns without calling again, so it stops.",
      requires: [{ concept: "base_case", min: "demonstrated" }],
    },
    {
      id: "h.base",
      kind: "hedge",
      exactState: "partially_taught",
      text: "I think it has to stop somewhere, but I am not sure where.",
      requires: [{ concept: "base_case", min: "partially_taught" }],
    },
    {
      id: "m.forever",
      kind: "misconception",
      misconception: M_FOREVER,
      requires: [],
      text: "Honestly, I thought a function that calls itself just keeps going forever.",
    },
    UNCERTAIN,
  ],
  answerKey:
    "When n reaches 0 the function returns without recursing. Each call passes n - 1, so starting from a nonnegative integer, n always reaches 0.",
  nextStep: nextStepFor([
    "base_case",
    "progress_toward_base_case",
    "smaller_subproblem",
    "recursion_runs_forever",
  ]),
};

const B_P2: Question = {
  id: "rec.B.P2",
  pairId: "P2",
  type: "trace",
  difficulty: 2,
  steps: 3,
  prompt: "What does sumTo(3) return?",
  code: "function sumTo(n) {\n  if (n === 0) return 0;\n  return n + sumTo(n - 1);\n}",
  assumptions: "n is a nonnegative integer",
  relevantMisconceptions: [],
  criteria: [
    { id: "c1", text: "Names the base value returned at n === 0 (0)", points: 1, requires: ["base_case"] },
    { id: "c2", text: "Explains results combine on the way back up", points: 1, requires: ["return_path", "recursive_call"] },
    { id: "c3", text: "Concludes the final value is 6", points: 1, requires: ["base_case", "return_path", "recursive_call"] },
  ],
  fragments: [
    {
      id: "f.c1",
      kind: "fact",
      supportsCriterion: "c1",
      text: "At n = 0 it returns 0 without calling again.",
      requires: [{ concept: "base_case", min: "demonstrated" }],
    },
    {
      id: "f.c2",
      kind: "fact",
      supportsCriterion: "c2",
      text: "Each call adds n to the value the smaller call returns.",
      requires: [
        { concept: "return_path", min: "demonstrated" },
        { concept: "recursive_call", min: "demonstrated" },
      ],
    },
    {
      id: "f.c3",
      kind: "fact",
      supportsCriterion: "c3",
      text: "So sumTo(3) is 3 + 2 + 1 + 0 = 6.",
      requires: [
        { concept: "base_case", min: "demonstrated" },
        { concept: "return_path", min: "demonstrated" },
        { concept: "recursive_call", min: "demonstrated" },
      ],
    },
    {
      id: "h.return",
      kind: "hedge",
      exactState: "partially_taught",
      text: "The calls return something, but I am not sure how they combine.",
      requires: [{ concept: "return_path", min: "partially_taught" }],
    },
    UNCERTAIN,
  ],
  answerKey:
    "sumTo(3) returns 6: it computes 3 + 2 + 1 + 0, where sumTo(0) returns 0 as the base value and each call adds n to the smaller result.",
  nextStep: nextStepFor(["base_case", "return_path", "recursive_call"]),
};

const B_P3: Question = {
  id: "rec.B.P3",
  pairId: "P3",
  type: "non-progress",
  difficulty: 2,
  steps: 2,
  prompt: "What happens when sumTo(3) calls sumTo(n + 1) instead?",
  code: "function sumTo(n) {\n  if (n === 0) return 0;\n  return n + sumTo(n + 1);\n}",
  assumptions: "n is a nonnegative integer",
  relevantMisconceptions: [M_FOREVER],
  criteria: [
    {
      id: "c1",
      text: "Explains n + 1 moves the input away from 0",
      points: 1,
      requires: ["smaller_subproblem", "progress_toward_base_case"],
      contradictedBy: [M_FOREVER],
    },
    {
      id: "c2",
      text: "Concludes the base case is never reached and the stack overflows",
      points: 1,
      requires: ["base_case", "progress_toward_base_case"],
      contradictedBy: [M_FOREVER],
    },
  ],
  fragments: [
    {
      id: "f.c1",
      kind: "fact",
      supportsCriterion: "c1",
      text: "Adding 1 each time moves n away from 0, not toward it.",
      requires: [
        { concept: "smaller_subproblem", min: "demonstrated" },
        { concept: "progress_toward_base_case", min: "demonstrated" },
      ],
    },
    {
      id: "f.c2",
      kind: "fact",
      supportsCriterion: "c2",
      text: "Since n never becomes 0, the stop condition is never hit and the stack overflows.",
      requires: [
        { concept: "base_case", min: "demonstrated" },
        { concept: "progress_toward_base_case", min: "demonstrated" },
      ],
    },
    {
      id: "h.base",
      kind: "hedge",
      exactState: "partially_taught",
      text: "I think there is meant to be a stopping point, but I am not sure it is reached.",
      requires: [{ concept: "base_case", min: "partially_taught" }],
    },
    {
      id: "m.forever",
      kind: "misconception",
      misconception: M_FOREVER,
      requires: [],
      text: "Honestly, I thought a function that calls itself just keeps going forever.",
    },
    UNCERTAIN,
  ],
  answerKey:
    "It never stops: n + 1 moves away from 0, so n === 0 is never true and the calls pile up until the stack overflows.",
  nextStep: nextStepFor([
    "smaller_subproblem",
    "progress_toward_base_case",
    "base_case",
    "recursion_runs_forever",
  ]),
};

const B_P4: Question = {
  id: "rec.B.P4",
  pairId: "P4",
  type: "transfer",
  difficulty: 3,
  steps: 2,
  prompt: "How could countChars(s) be written to count characters recursively?",
  code: "function countChars(s) {\n  if (s.length === 0) return 0;\n  return 1 + countChars(s.slice(1));\n}",
  assumptions: "s is a finite string",
  relevantMisconceptions: [],
  criteria: [
    { id: "c1", text: "Calls itself on the rest of the input", points: 1, requires: ["recursive_call", "smaller_subproblem"] },
    { id: "c2", text: "Returns 0 for the empty input", points: 1, requires: ["base_case"] },
    { id: "c3", text: "Adds 1 to the count the smaller call returns", points: 1, requires: ["return_path"] },
  ],
  fragments: [
    {
      id: "f.c1",
      kind: "fact",
      supportsCriterion: "c1",
      text: "It calls itself on the string without the first character.",
      requires: [
        { concept: "recursive_call", min: "demonstrated" },
        { concept: "smaller_subproblem", min: "demonstrated" },
      ],
    },
    {
      id: "f.c2",
      kind: "fact",
      supportsCriterion: "c2",
      text: "An empty string returns 0.",
      requires: [{ concept: "base_case", min: "demonstrated" }],
    },
    {
      id: "f.c3",
      kind: "fact",
      supportsCriterion: "c3",
      text: "It adds 1 to whatever the shorter string returns.",
      requires: [{ concept: "return_path", min: "demonstrated" }],
    },
    {
      id: "h.base",
      kind: "hedge",
      exactState: "partially_taught",
      text: "I think the empty string is the stopping point, but I am not certain what it returns.",
      requires: [{ concept: "base_case", min: "partially_taught" }],
    },
    UNCERTAIN,
  ],
  answerKey:
    "Return 0 for an empty string; otherwise return 1 + countChars(rest), so each call handles one fewer character until the string is empty.",
  nextStep: nextStepFor(["recursive_call", "smaller_subproblem", "base_case", "return_path"]),
};

const QUESTIONS_A: Question[] = [A_P1, A_P2, A_P3, A_P4];
const QUESTIONS_B: Question[] = [B_P1, B_P2, B_P3, B_P4];

/**
 * form_version = semantic version + content hash of the frozen content
 * (rubric version, seeded misconceptions, both question banks). Any edit to the
 * content changes the hash; past attempts keep their own snapshots.
 */
const FORM_SEMVER = "1.0.0";
const contentHash = createHash("sha256")
  .update(
    JSON.stringify({
      rubricVersion: RUBRIC_VERSION,
      seeded: SEEDED_MISCONCEPTIONS.map((m) => m.id),
      A: QUESTIONS_A,
      B: QUESTIONS_B,
    }),
  )
  .digest("hex");
export const FORM_VERSION = `${FORM_SEMVER}+${contentHash.slice(0, 12)}`;
export const FORM_CONTENT_HASH = contentHash;

export const FORM_A: Form = { id: "recursion.A", version: FORM_VERSION, questions: QUESTIONS_A };
export const FORM_B: Form = { id: "recursion.B", version: FORM_VERSION, questions: QUESTIONS_B };
export const FORMS: Form[] = [FORM_A, FORM_B];

export function getForm(id: Form["id"]): Form {
  const form = FORMS.find((f) => f.id === id);
  if (!form) throw new Error(`unknown form: ${id}`);
  return form;
}
