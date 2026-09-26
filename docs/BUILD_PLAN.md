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

### 2026-09-26 — Phase 3 (in progress: foundation)

Branch `feat/phase-3-persistence` from `main` @ `8fc827d`. Baseline
`npm run verify` **PASSED** before Phase 3 edits. See `PHASE3.md` for scope,
the teammate-change classification, the recommended-model plan, and the remaining
tasks (repository, Gemini adapter, routes, frontend, fixtures).

Done this session (STEP 0–2 + Task A):

- **STEP 1 secrets:** `scripts/check-secrets.ts` (in `verify` + CI) and a
  `.githooks/pre-commit` hook; verified it blocks a staged fake credential;
  `git ls-files` shows only `.env.example` among env files; none ever committed.
- **STEP 2 env:** `scripts/check-env.ts` — every rule PASS against `.env.local`,
  no values printed; both databases TLS-connect (Postgres 18, ~150 ms), distinct
  host/db; `GEMINI_API_KEY` present; `GEMINI_MODEL` blank (allowed).
- **Task A DB:** `lib/db/schema.ts` (§3), migration `0000_*` reviewed and applied
  to `DATABASE_URL` and `DATABASE_URL_TEST`; pool client (max 5); db scripts;
  `tests/db/schema.test.ts` (information_schema) — **PASS** (gate item 6).

Regression gate (`npm run verify`): **PASS** — lint (0 warnings), typecheck,
**340 tests (8 files)**, check:content, check:secrets, build, check:bundle.
`docs/source` and `lib/content` unchanged this session.

### 2026-09-26 — Phase 3b (Tasks C, F, B)

Branch `feat/phase-3b-evaluator-repo` from `main` @ `522cc5e` (PR #3 merged).
Baseline `verify` + `check:env` **PASSED**. No new teammate commits since `8fc827d`.

- **C. Gemini adapter:** `lib/evaluator/gemini.ts` (@google/genai, structured
  output, 20 s/≤2-attempt budget, SDK retries off, validator pass-through);
  budget runner + request-separation + fake-isolation tests. `GEMINI_MODEL`
  chosen and written to `.env.local` (see PHASE3.md).
- **F. Fixtures + live:** `fixtures/evaluator/{tuning,heldout}` + conservative
  scorer + `scripts/eval-live.ts`. Prompt frozen at `p1`. **Held-out live ×3
  BLOCKED by free-tier quota** (partial tuning evidence: 5/6 passed, 0 base_case
  over-credits before exhaustion).
- **B. Repository + service:** `lib/db/repository.ts`, `lib/session/{service,dto,errors}.ts`.
  Two-phase teaching writes, idempotency, ownership (constant-time), phase
  transitions, record pinning, completion. Composite record/message FKs made
  ON DELETE CASCADE for cleanup (migration `0001`).

Gate results this session:

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| 1 | `npm run verify` | recorded in report | lint 0 warnings, typecheck, tests, content, secrets, build, bundle |
| 2 | docs/source + lib/content unchanged | **PASS** | git diff empty |
| 3 | Task A schema test | **PASS** | still green |
| 4–12 | service integration tests (FakeEvaluator, test DB) | **PASS** | 13 tests: integrity, idempotency, concurrency, transitions, ownership, failure/retry, pinning, completion, DTO leakage |
| 13 | `eval:live` held-out ×3 | **BLOCKED (quota)** | adapter proven live; partial results in PHASE3.md |
| 14 | `smoke:service` | **BLOCKED (quota)** | pipeline runs + cleans up; live teach 429 |

**Deviations:** success field named `evaluation` (not `record`); composite FKs
ON DELETE CASCADE (§3 left ON DELETE unspecified); model is `gemini-3.8-flash`
because `gemini-2.5-flash` is 404 for new users on this project.

### 2026-09-26 — Phase 3c (routes, frontend, live)

Branch `feat/phase-3c-routes-ui` from `main` @ `d53d77f` (PR #4 merged). Baseline
`verify` + `check:env` **PASSED**. No teammate commits since the last report.

- **STEP 1:** `eval-live.ts` gains `--runs/--only/--resume`, a call counter, and
  a graceful 429/quota stop. Held-out ×3 and `smoke:service` **BLOCKED (429 quota)**.
  `smaller_subproblem` under-credit cause = the prompt's few-shot bar (a prompt
  fix, deferred pending live measurement; validation not loosened). Prompt stays `p1`.
- **STEP 2:** enriched `RESPONSE_SCHEMA` to mirror the Zod contract + ajv parity
  test (15 cases). `z.toJSONSchema` unusable here (module-scope `_idmap` error).
- **D. Routes:** six owner-scoped Node handlers; 7 route tests (gates 4–10).
- **E. Frontend:** API client, session binding, truthful states, cross-highlighting,
  home start action; dev mocks behind a flag; bundle scan still clean.

Gate results:

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| 1 | `npm run verify` | recorded in report | lint 0 warnings, typecheck, tests, content, secrets, build, bundle |
| 2 | docs/source + lib/content unchanged | **PASS** | git diff empty |
| 3 | schema + 3b service tests | **PASS** | on test DB |
| 4–10 | route tests (constructed Requests, test DB) | **PASS** | 7 tests: ownership, idempotency, conflicts, limits, leakage, cookie flags, failure/retry |
| 11 | held-out ×3 / smoke:service | **BLOCKED (429 quota)** | scripts ready; `--resume` supported |
| 12 | `smoke:http` | **BLOCKED (429 quota)** | script ready (`npm run smoke:http`) |
| 13 | browser | **manual checklist** in PHASE3.md (quota-blocked) |

**Deviations:** complete route takes `sessionId` in the body (per-session owner
cookie); enriched response schema needs live re-check when quota resets.
