# The Inverse Tutor

> If you truly understand something, can you teach it well enough for someone else to use it?

## The idea and audience

Students explain recursion to a simulated learner, inspect which ideas their
explanation supports, and revise missing or contradictory teaching. The initial
audience is UMBC introductory programming students.

The learner is a **rubric-driven simulation**. Its answers are composed from
authored fragments permitted by a validated teaching record. Its score measures
the explanation's coverage; it does not independently establish the student's
mastery, real model learning, or model generalization. A UMBC pilot with separate
student pre/post questions is proposed, not yet conducted.

## Planned loop

1. **Teach:** submit an explanation; Gemini evaluates it against five concepts.
2. **Assess:** a deterministic learner answers a frozen form from the validated record.
3. **Inspect:** trace missed criteria to concepts and the student's original words.
4. **Reteach:** clarify a missing idea or retract an incorrect explanation.
5. **Reassess:** compare a second matched form while preserving the first attempt.

## Current status

**Phases 1 and 2 are implemented.** The repository contains contracts, frozen
recursion content, a development-only session UI scaffold, exact evidence
validation, misconception lifecycle, immutable in-memory snapshots, deterministic
answers/scoring, and authored follow-up selection.

The typed UI is not yet connected to a live evaluator or database. Phase 3 adds
those integrations and persistence. Review/comparison UI, deployment verification,
and ElevenLabs voice come later. The learner never calls an LLM to generate answers.

## Tech stack

- Next.js App Router, React 19, TypeScript, Tailwind CSS 4.
- Zod contracts, Vitest regression tests, ESLint, GitHub Actions.
- Planned Phase 3: Gemini evaluator (`@google/genai`), PostgreSQL/Tiger Data, Drizzle.
- Planned Phase 5: ElevenLabs speaks already-approved learner text.

## Project structure

```text
app/session/[id]/           Three-panel development scaffold
components/                TeachPanel, ConceptMap, AssessmentPanel
hooks/useSession.ts        Session reducer and context
lib/contracts/             Domain types, Zod schemas, provider interfaces
lib/content/recursion/     Server-only rubric, misconception, frozen forms
lib/evaluator/             Pure provenance and output validation
lib/learner/               Pure scoring, fragments, snapshots, lifecycle, probes
lib/db/                    Initial placeholder; Phase 3 replaces this schema
tests/                     Contracts, content, validator, learner regressions
docs/source/               Authoritative reviewed design and handoff
```

## Run locally

Use Node.js 20.19+ on the 20.x line, or Node.js 22.12+ (CI uses Node 20), then:

```bash
npm ci
npm run verify
npm run dev
```

Open [localhost:3000](http://localhost:3000) or
[the development session scaffold](http://localhost:3000/session/demo).
**Phases 1–2 need no API keys or database.** The fixture is development-only and
does not run the future live teaching loop.

Before Phase 3, copy `.env.example` to `.env.local` and configure
`GEMINI_API_KEY`, `GEMINI_MODEL`, and `DATABASE_URL`. Never commit real values.
The initial `lib/db` migration is a placeholder, not the reviewed seven-table
schema; Phase 3 will add and verify the actual migrations. ElevenLabs credentials
and voice selection are only needed for Phase 5.

## Verification and handoff

`npm run verify` runs lint, route-type generation/TypeScript, tests, frozen-content
validation, production build, and the client bundle leak scan. The suite has
336 tests, including 7,776 exhaustive answer/score cases. One pre-existing unused
parameter warning remains in the database placeholder.

- [Build plan and dated results](docs/BUILD_PLAN.md)
- [Current architecture](docs/ARCHITECTURE.md)
- [Phase 2 function contracts, choices, and limits](docs/PHASE2.md)
- [Authored rubric and assessment content inventory](docs/AUTHORED_CONTENT.md)

The existing [DigitalOcean App Platform spec](.do/app.yaml) is deployment preparation.
Production hosting, provider connectivity, and the live app have not been verified
in Phase 2; those are later-phase gates.
