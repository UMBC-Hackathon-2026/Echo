# The Inverse Tutor — build plan

Six phases (from `docs/source/ARCHITECTURE_REVISED.md` §8 and
`docs/source/HANDOFF_REVIEW.md`). Acceptance criteria are checklists; actual
command results go in the **Validation log** with dates. **Regression rule:**
every phase ends by running `lint`, `typecheck`, `test`, `check:content`,
`build`, `check:bundle` (i.e. `npm run verify`) plus prior phases' checks.

## Phase 1 — Contracts, content, scaffold  ✅

- [x] Adapted architecture (`docs/ARCHITECTURE.md`) + this plan; source docs kept in `docs/source/`.
- [x] Zod/domain contracts in `lib/contracts/` (concepts, evaluator, record, assessment, session, DTOs) + ports (interfaces only).
- [x] Recursion rubric + seeded misconception + frozen forms A/B (`lib/content/recursion/`), each file `import 'server-only'`.
- [x] `form_version` = semver + content hash (freeze recorded below).
- [x] `check:content` enforces the six rules + structural checks; fails non-zero on violations.
- [x] Tooling: `lint`, `typecheck`, `test` (vitest), `check:content`, `check:bundle`, `build`, `verify`; GitHub Actions runs `npm ci && npm run verify`.
- [x] `.env.example` with future vars (no values); `.env*` gitignored except the example.
- [x] Single `app/session/[id]/page.tsx` with the three panels wired to a reducer; mock data dev-only under `fixtures/dev/`.

**Gate:** app builds; content validation passes; no answer keys or secrets in the
client bundle or DTOs. Unit tests cover the contracts and prove each content rule
fires on a broken copy. See Validation log.

## Phase 2 — Deterministic learner + validation ✅

- [x] Validation gate (`lib/evaluator/validate.ts`): Zod shape, conservative fallback, empty-evidence downgrade, exact-span provenance (keeps `n + 1` ≠ `n - 1`), contradiction caps.
- [x] Gate + answer composer (`lib/learner/`): criterion scoring, fragment selection, outcome, remediation — pure functions.
- [x] Misconception lifecycle (seeded + student), probe selector.
- [x] Targeted tests: no/partial/full teaching, unsupported fragments, empty evidence, wrong turn ids, `n+1` vs `n-1`, contradictions, misconceptions; exhaustive 3^5 state sweep.

**Gate:** displayed answer and score agree for every question; all targeted tests pass.

Implementation details and authored choices: [`PHASE2.md`](./PHASE2.md).

## Phase 3 — Persisted typed loop + live evaluator

- [ ] Drizzle schema + migrations (7 tables, §3); owner-scoped routes; phase transitions; idempotency; revision checks.
- [ ] Gemini adapter (`@google/genai`), bounded call, truthful failure states; frontend bound to the real API; hydration + pending/error states.

**Gate:** a fresh explanation reaches Gemini, validated state persists, an attempt
pins it, refresh restores, duplicates don't duplicate. Report live tests blocked
if no credentials.

## Phase 4 — Review, reteaching, comparison

- [ ] Full review row + cross-panel highlights; reteach transition; form B; paired before/after comparison; fresh-session action.

**Gate:** omit base case → see deficiency → reteach → second attempt changes;
attempt 1 unchanged; a wrong reteach does not improve; browser E2E; demo video.

## Phase 5 — Presentation, deploy, voice

- [ ] Accessibility + layout polish; DigitalOcean deploy of the core; ElevenLabs TTS with clean failure; optional STT.

**Gate:** deployed build retested end-to-end; voice failure never blocks the loop; 3–5 min demo rehearsed.

## Phase 6 — Submission & handoff

- [ ] README, setup/migration, env example, architecture, demo steps, sponsor usage, limitations, pilot proposal, screenshots, video.

**Gate:** a teammate installs and runs from docs; all checks pass; repo visibility + collaborator access verified.

---

## Content freeze record

- **Frozen:** 2026-09-26
- `RUBRIC_VERSION` = `1.0.1`
- `FORM_VERSION` = `1.0.1+fd846dc9f057`
- `FORM_CONTENT_HASH` (sha256) = `fd846dc9f057890331e98b0774f095457c263c7ca7bc18c7f0c42c59cb098c26`
- Forms A/B, pairs P1–P4 (termination, trace, non-progress, transfer). Seeded
  misconception `recursion_runs_forever` relevant to P1 and P3.
- Any content edit changes the hash and must bump the version; past attempts keep
  their own question snapshots (§5).

## Regression baseline (checks that exist now, re-run every phase)

| Check | Command | Notes |
| --- | --- | --- |
| Lint | `npm run lint` | eslint (Next config) |
| Types | `npm run typecheck` | `next typegen && tsc --noEmit` (works before the first build) |
| Unit tests | `npm run test` | vitest — contracts + content rules + rubric/fragment regressions |
| Content | `npm run check:content` | six rules + structural checks |
| Build | `npm run build` | Next production build |
| Bundle leak | `npm run check:bundle` | no answer keys/secrets/mocks in `.next/static` |
| All | `npm run verify` | the six above, in order (also in CI) |

## Deviations / authored content

The source docs fully specify the contracts, rubric, forms P1–P4, the six content
rules, the seeded misconception, and the reducer shape; those were followed as
written. The following were **authored to fill gaps**, per the instruction to
follow the `rec.A.P1` example and keep every fragment within its prerequisites —
each question, fragment, remediation hint, and example is itemized in
[`AUTHORED_CONTENT.md`](./AUTHORED_CONTENT.md) for review:

1. **Fragment/answer-key/next-step wording for P1(B), P2–P4 (both forms).** Only
   `rec.A.P1` is written out in full in §5; the rest were authored to the same
   shape. Fact fragments require exactly their criterion's concepts at
   `demonstrated`; hedges are single-concept `partially_taught`; no fragment
   states a fact beyond its prerequisites.
2. **`nextStep` hint text** per concept/misconception (shared map in `forms.ts`).
3. **15 few-shot examples** (one per concept/state), with expected state and
   rationale. These are authored prompt examples, not measured evaluator results.
   Probe wording remains verbatim from the §5 rubric table.
4. **`lib/content/validate.ts` message prefixes** (`[rule1]`…`[rule6]`, `[ids]`,
   `[concepts]`, `[rule4]`) — an implementation detail of the six rules.
5. **Ports method signatures** (`SessionRepository`) are high-level; concrete
   refinement lands with the Drizzle implementation in Phase 3.
6. **`.npmrc` `legacy-peer-deps=true`** and an explicit `vite` devDependency:
   needed so vitest installs alongside Next 16's pinned `@types/node ^20`.
7. **`lib/db/` scaffold** from the initial commit is left in place; Phase 3
   replaces it with the §3 Drizzle schema.

8. **P4 partial-base-case hedges** in both forms now use the source P1 uncertainty
   wording. Earlier authored hints disclosed the empty-input condition without
   the prerequisite being demonstrated; the correction has regression tests.
9. **Content fingerprint** now covers the complete rubric/examples and seeded
   misconception metadata as well as both forms. Rubric/form semver bumped to
   `1.0.1` before freezing the corrected content.
10. **Clean-checkout typecheck** generates Next.js route types before TypeScript.
    The previous script depended on a prior local build and failed in Ubuntu CI.

## Validation log

### 2026-09-26 — Phase 1

- `npm run typecheck` → **PASS** (exit 0).
- `npm run test` (vitest) → **PASS** — 2 files, 18 tests. Contracts: valid sample
  passes; unknown id, duplicate id, invalid state, extra keys, empty quote all
  rejected. Content: real forms pass; broken copies fire `[rule1]`, `[rule2]`,
  `[rule3]`, `[rule4]`, `[rule5]`, `[rule6]`, `[ids]`, `[concepts]`.
- `npm run check:content` → **PASS** — 2 forms, 8 questions pass all six rules.
- `npm run lint` → **PASS** (exit 0; warnings only, in the Phase 3 `lib/db` stub).
- Build/bundle results were not recorded in this initial log. The complete
  closure run below supersedes this incomplete entry.


### 2026-09-26 — Phase 1 closure

Executed `npm run verify` in `C:\Users\aahan\Desktop\UMBC` after the
typecheck, example, and P4-hedge corrections. Overall exit code: **0**.

| Command | Actual result |
| --- | --- |
| `npm run lint` | **PASS**, 0 errors; 1 existing unused-parameter warning in `lib/db/client.ts:21` |
| `npm run typecheck` | **PASS**, route types generated before `tsc --noEmit` |
| `npm run test` | **PASS**, 28 tests in 3 files |
| `npm run check:content` | **PASS**, 2 forms / 8 questions; all six rules |
| `npm run build` | **PASS**, Next.js production build; `/`, `/_not-found`, `/session/[id]` |
| `npm run check:bundle` | **PASS**, 13 client files; none of the 3 answer/fragment sentinels, secret markers, or dev mock sentinel found |
| `npm run verify` | **PASS**, all six commands above |
| `git diff --check` | **PASS**, no whitespace errors |
| Tracked environment files | **PASS**, only `.env.example`; no real `.env` tracked |
| Source-document preservation | **PASS**, no changes under `docs/source/` |

The original 18 tests still pass, including valid evaluator output and rejection
of unknown IDs, duplicate IDs, bad states, extra keys, and empty quotes; broken
content copies cover all six rules plus structural checks. Ten added tests cover
all 15 rubric examples, unique example IDs, absence of assessment function names
in examples, full form-schema validity, and the two P4 hedge regressions.

GitHub CI runs the same gate after a clean `npm ci`, without a prior `.next`
directory. Its latest result is available on PR #1. No live provider calls or
database connections are part of Phase 1. Phases 2–6 remain unchecked.


### 2026-09-26 — Phase 2 closure

Executed `npm run verify` in `C:\Users\aahan\Desktop\UMBC` on
`feat/phase-2-learner`, based on merged Phase 1 (`7957a5a`). Exit code: **0**.

| Command | Actual result |
| --- | --- |
| `npm run lint` | **PASS**, 0 errors; the existing unused-parameter warning in `lib/db/client.ts:21` remains |
| `npm run typecheck` | **PASS**, generated route types plus TypeScript |
| `npm run test` | **PASS**, 336 tests across 7 files (all 28 Phase 1 tests retained) |
| `npm run check:content` | **PASS**, 2 forms / 8 questions / all six rules |
| `npm run build` | **PASS**, production build including `/session/[id]` |
| `npm run check:bundle` | **PASS**, 13 client files; configured answer, secret, and dev-fixture sentinels absent |
| `npm run verify` | **PASS**, all six checks |

The exhaustive learner suite checks 243 concept-state vectors × 2 seeded-belief
states × 2 uncertainty states × 8 questions = **7,776** answer/score cases.
Separate tests cover each individually uncertain concept, exact original spans,
wrong turn IDs, operator differences, negation/keyword fixtures, corrections,
student/seeded origins, event transitions, immutable snapshots, and wrong reteaching.

`GATE_VERSION` and `VALIDATOR_VERSION` are `1.0.0`. Frozen content remains
`1.0.1+fd846dc9f057`; authoritative sources and assessment content are unchanged.
Only `.env.example` is tracked. No new dependencies or credentials were needed.

**Decisions / limits:** see `PHASE2.md` for student-origin key namespacing,
same-turn contradiction handling, deterministic remediation ordering, missing-entry
fallback, and original UTF-16 offsets. Provenance does not validate semantic truth;
live Gemini correctness and prompt adherence remain Phase 3 tests. The new functions
are not yet wired into routes, persistence, or the scaffold UI. Phases 3–6 remain
unchecked. GitHub CI runs the same gate on the Phase 2 pull request.
