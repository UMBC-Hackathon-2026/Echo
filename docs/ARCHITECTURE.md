# The Inverse Tutor — architecture (as built)

This is the working architecture adapted to the actual repository layout. The
authoritative sources are in [`docs/source/`](./source): **`HANDOFF_REVIEW.md`**
(the team review — wins on any conflict) and **`ARCHITECTURE_REVISED.md`** (the
revised design). This file maps that design to real paths and records what Phase
1 actually built. Section numbers below refer to `ARCHITECTURE_REVISED.md`.

## Product in one line

A student teaches a rubric-driven simulated learner, watches it take a frozen
assessment, traces each wrong answer back to their own words, reteaches, and
compares a second attempt. First topic: **recursion**. The simulated learner's
score measures the explanation's coverage, **not** human learning (§10).

## The one invariant

The learner only says what the validated teaching record allows. Gemini is used
**only** to evaluate the student's explanation (one bounded call). Everything the
learner "says" and every score is computed in code from the record and the
frozen forms — no LLM is on the assessment path (§1, §2).

## Repository layout (Phase 1)

| Path | Role | Source § |
| --- | --- | --- |
| `lib/contracts/` | Zod schemas + TS types + ports (evaluator, repository, clock/id). Client-safe. | §2, §6 |
| `lib/content/recursion/` | `server-only` rubric, seeded misconception, frozen forms A/B, `form_version`. | §5 |
| `lib/content/validate.ts` | Pure content validator (the six rules + structural checks). | §5 |
| `scripts/check-content.ts` | Runs the validator over the frozen content; fails CI on any violation. | §5 |
| `scripts/check-bundle.ts` | Post-build scan: no answer keys, secrets, or dev mocks in the client bundle. | §4 |
| `hooks/useSession.ts` | `useReducer` + context store; server response is the only source of truth. | §6 |
| `app/session/[id]/page.tsx` | Single page, three panels at once. | §6 |
| `components/{TeachPanel,ConceptMap,AssessmentPanel}/` | The three panels, reading the store. | §6 |
| `fixtures/dev/mockSession.ts` | Dev-only mock, stripped from production builds. | Phase 1 gate |
| `lib/db/` | Placeholder from the initial scaffold; superseded in Phase 3 by the Drizzle schema (§3). | §3 |

## Data flow (target, built out Phase 3+)

1. **Teach** — `POST /api/sessions/[id]/messages`: insert pending turn (tx1), one
   bounded Gemini call, validate output against Zod + exact character-span
   provenance, persist an immutable record version (tx2) iff the revision is
   still valid (§2, §3).
2. **Assess** — `POST /api/sessions/[id]/attempts`: pin the record, run the
   deterministic gate + answer composer over the frozen form, persist the
   attempt and all results in one transaction. No Gemini (§2, §4).
3. **Review / reteach / compare** — server-enforced phase transitions; earlier
   attempts and records never change (§4).

## Contracts that Phase 2+ depend on

- `ConceptId` (the only five), `ConceptState` (`not_taught` | `partially_taught`
  | `demonstrated`).
- `EvaluatorOutput` (strict) — what Gemini must return; validation can only
  **lower** states.
- `LearningRecord` — immutable snapshot with `Span` evidence and a misconception
  lifecycle (`seeded`/`student`, `active`/`resolved`).
- `Criterion` / `Fragment` (`fact` | `context` | `hedge` | `misconception` |
  `uncertain`) / `Question` / `Form` / `Outcome` / `QuestionResult`.
- Public DTOs that never expose answer keys, criteria internals, or rubric text
  until an attempt is complete (§4, §6).
- Ports (interfaces only): `EvaluatorAdapter`, `SessionRepository`,
  `Clock`/`IdProvider`.

## Honest framing (§10)

The simulated learner's score reflects rubric coverage of the explanation. It is
not an independent test of human learning or model generalization. The UMBC
evaluation is a **proposed pilot** with separate pre/post student questions.

## Deviations from the source

Recorded in `docs/BUILD_PLAN.md` under "Deviations / authored content".
