# Phase 2: deterministic learner and evidence validation

Implemented against `source/HANDOFF_REVIEW.md` (takes precedence) and
`source/ARCHITECTURE_REVISED.md`, section 2. Source files and frozen content are
unchanged. No Gemini calls, persistence, routes, or UI wiring are added here.

## Pure function entry points

| Module | Entry point | Responsibility |
| --- | --- | --- |
| `lib/evaluator/provenance.ts` | `resolveEvidence`, `indexStudentTurns` | Check the cited student turn in this session; return original-text spans |
| `lib/evaluator/validate.ts` | `validateEvaluation` | Strict output boundary; conservative states, verified conflicts/reports |
| `lib/learner/record.ts` | `createInitialRecord`, `createLearningRecord` | Versioned, deeply frozen snapshots plus misconception event payloads |
| `lib/learner/misconceptions.ts` | `updateMisconceptions` | Seed resolution/reactivation and student assertion/retraction lifecycle |
| `lib/learner/gate.ts` | `assessQuestion` | Criteria, fragments, points, outcome, blocking concepts, and remediation |
| `lib/learner/probe.ts` | `selectProbe` | First incomplete concept's authored probe, or null |

The learner gate imports no transcript, rubric, question bank, database, or model
client. Its only inputs are the pinned record and a frozen validated question.
Content-bearing server modules use `server-only`. The gate and validator versions
are both `1.0.0`; rubric/form content retains `1.0.1+fd846dc9f057`.

## Evidence rules

- Reject malformed output, extra fields, invalid states, unknown/duplicate concept
  IDs, or unknown misconception IDs as a whole. Exceptions must be handled as
  evaluation failure by the Phase 3 adapter; never partially persist that output.
- The architecture's explicit missing-entry fallback produces five final entries:
  missing concepts become `not_taught` with reason `not assessed`.
- An empty quote fails the schema. An empty evidence array, whitespace-only quote,
  or no surviving exact references lowers a positive claim to `not_taught`.
- Matching is case-sensitive. Only NFC, curly-to-straight quote conversion, and
  whitespace-run collapsing are allowed. Operators and punctuation remain intact.
- Offsets are JavaScript UTF-16 `[start, end)` indices into the original text.
  Grapheme-to-original mappings preserve decomposed Unicode, emoji, CRLF, and
  whitespace; the stored quote is the original slice, not normalized text.
- Wrong turn IDs are dropped, never repaired by searching another turn. Duplicate
  numeric turn IDs, nonstudent turns, and cross-session inputs fail the boundary.
- Verified unresolved conflicts cap a concept at partial and mark it uncertain.
  A model-declared `later_correction` counts only when the latest supporting turn
  is numerically later than every verified conflict. The conflict history remains.

**Semantic limit:** this code can lower claims based on provenance and reported
conflicts; it does not independently interpret the explanation. Negation and
keyword fixtures preserve conservative model judgments. A separate test explicitly
demonstrates that a wrong model judgment with an exact quote can still pass.
Prompt-injection fixtures are inert data here; live prompt adherence and semantic
accuracy require Phase 3 held-out Gemini evaluation.

## Misconception history and authored implementation choices

The source specifies both seeded and student-origin beliefs but provides a record
map indexed by strings. To preserve both origins when the student explicitly
asserts the same belief as the seed:

- `recursion_runs_forever` stores the seeded belief, always with no student evidence.
- `student:recursion_runs_forever` stores the separate student-origin belief.
- Gate matching converts both keys to the canonical content ID. Either active
  entry blocks the applicable criterion; the displayed misconception appears once.
- Event payloads retain canonical misconception ID, origin, event, evidence, and
  version. Phase 3 must persist these with the snapshot in one transaction.
- Missing reports do not erase earlier student beliefs. Retractions must be later
  than the latest stored evidence. Replayed/older reports produce no status event.
  A later assertion reactivates a resolved belief. Conflicting reports within one
  turn favor the assertion, so an unresolved belief is not silently removed.
- The seeded belief uses the specified state rule: demonstrated base case plus
  at least partial progress. It reactivates if a later snapshot loses that coverage.

Additional choices where the sources leave implementation details open:

- Repeated matching text uses its first valid occurrence in the cited turn;
  duplicate identical spans are deduplicated, with the original three-ref bound.
- Remediation concatenates applicable authored hints in rubric concept order,
  then relevant misconception order; no blockers means null.
- Context facts require non-uncertain support. Probes revisit uncertain concepts,
  as well as any concept below demonstrated.
- Snapshot IDs come from the caller. Versions increment from the prior snapshot;
  new snapshots reject cross-session identity, reused IDs, backward cycles, and
  omitted prior turns. Inputs are not mutated; returned snapshots are deeply frozen.

No new rubric text, probes, questions, fragments, or source requirements were authored
or modified in Phase 2. Namespace handling adds no new misconception category.

## Verification coverage

- Original Phase 1 contract/content checks remain in the regression suite.
- Provenance: exact spans, NFC, curly quotes, whitespace, emoji, duplicate text,
  case, punctuation/operators, wrong turn, session ownership, and malformed IDs.
- Validation: shape rejection, all five final concepts, conservative fallback,
  multi-turn evidence, conflicts, later corrections, incorrect keyword explanations,
  negation, injected instructions, and verified misconception reports.
- Gate: no/partial/full teaching, unsupported facts, relevant/irrelevant beliefs,
  uncertain individual concepts, precise blockers, null remediation, and pure inputs.
- Exhaustive sweep: 243 concept-state vectors × 2 seeded-belief states × 2 global
  uncertainty states × 8 questions = **7,776** answer/score cases, plus targeted
  tests for each individual uncertain concept.
- Lifecycle: activation, resolution, replay, omission, reactivation, same-turn
  contradictions, separate origins, immutable snapshots, and wrong reteaching.

Actual commands and results are recorded in `BUILD_PLAN.md`.

## Phase 3 integration contract

Load owner-scoped original student turns; call the evaluator once under its bounded
retry budget; validate its unknown output; build a new snapshot; atomically persist
the snapshot and returned misconception events only if the session revision still
matches. Validation failure must preserve the text and show evaluation failed.

Assess only a selected immutable record using already content-validated frozen
questions. Persist all question results and snapshots together with gate, rubric,
form, and validator versions. Use explicit public DTOs; do not return rubric or
answer-key content before review is allowed. Persistence and UI integration remain
Phase 3 work.
