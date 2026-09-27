# Dynamic-topic generalization: Phase 5 and prerequisite audit

Date: 2026-09-27. This report covers the PDF/dynamic-rubric implementation plan, not the older numbered recursion/voice/deployment phases.

## Starting point

- Latest PR #14 was already merged. Work started from `origin/main` at `8f994e4`, including teammate commit `9cb028d` (dynamic topics).
- Branch: `feat/dynamic-topic-robustness`.
- Read `AGENTS.md` and the installed Next.js route-handler documentation. No repository `SKILL.md` or `skills.md` files were found outside dependencies/generated files; no optional skill was applied.
- Baseline `npm run verify` failed: 59 lint errors and 9 warnings. Baseline tests passed (389 tests). The initial TypeScript failure was caused by stale installed dependencies; `npm ci --ignore-scripts` restored the committed dependency set without changing the lockfile.

## Phases 1–4: verified status

| Phase | Status | Evidence and remaining work |
| --- | --- | --- |
| 1 — Database | Implemented, with migration risk | `lib/db/schema.ts` contains topics, JSONB rubric data, the four status values, and the sessions topic UUID foreign key. `npm run db:status` reports 3/3 migrations applied. Existing DB-backed session tests pass. Historical migration `0002_superb_jocasta.sql` deletes all sessions before changing the column type. No migrations were run during this work. Replace the destructive upgrade strategy before applying it to another database with retained history. |
| 2 — Upload UI | Partial | Topic input and file selection exist; limits are now shared with server validation. Loading and recoverable failure screens work. The request is synchronous: there is no backend status polling endpoint or resumable job. The misleading drag-and-drop label was corrected to describe the actual file picker. |
| 3 — Extraction | Partial | Files are uploaded through `@google/genai`, combined into one generation request, and deletion is attempted on all completion paths. Model remains `gemini-3.1-flash-lite`. No live generation was performed. There is no shared quota queue, token counting/reservation, or coordination with teaching calls. The Phase 5 process-local limiter does **not** establish compliance with the project-wide 15 RPM / 250K TPM / remaining 150 RPD budget. |
| 4 — Dynamic teaching loop | Incomplete | Session/evaluator code fetches topic rubrics, but the question DTO and review mapper still expect the old question structure. Generated questions have `text`; public mapping reads `prompt`. Completed review calls `q.criteria.map`, although generated questions have no `criteria`. A direct execution of `toQuestionResultDTO` with a generated-shaped question reproduced an absent prompt and `Cannot read properties of undefined (reading 'map')`. The dynamic learner gate ignores question-specific grading criteria: every question requires every topic concept and then returns the expected answer. This does not verify question-specific transfer or partial understanding. |

**Phases 1–4 cannot be signed off as complete.** The existing test suite passing does not prove the new dynamic assessment/review flow works.

## Phase 5 implemented

- Strict nested Zod objects reject missing/unknown fields, empty strings, missing expected answers, invalid enums, duplicate IDs, unsafe IDs, empty concept/question lists, and nonexistent/duplicate misconception resolution references.
- Generated rubrics are bounded to 1–20 concepts and questions, up to 20 misconceptions, and 1–10 examples per concept. General text is limited to 4,000 characters; topic names to 200 and IDs to 100. These are application safeguards, not evidence of provider quota compliance.
- The generation JSON schema is derived from the same structural Zod schema. Semantic cross-reference checks run locally before the database can be marked ready. Model output remains `unknown` until parsed. The student-supplied topic name is retained.
- Server validates a topic name, 1–20 nonempty PDFs, 10 MiB per file, PDF extension/MIME, and the `%PDF-` signature before DB creation or provider work. The signature is a basic format check, not a complete PDF parser.
- `/api/topics/create` rejects excess requests with HTTP 429 and `Retry-After` before reading multipart bodies or invoking Gemini. Limits: 3/client/10 minutes, 10 globally/minute, 50 globally/24 hours. Failed/invalid requests consume admission slots too.
- Provider errors, invalid JSON, invalid rubric content, and cleanup failures return the requested message without raw provider details:

  > We couldn't extract enough clear concepts from these documents. Please try adding more structured study guides.

- Existing topic rows are marked failed on errors, with no invalid rubric retained. A failed status write emits only a fixed diagnostic code. The loading screen offers a return to the form with topic and files preserved; rate-limit errors show the retry delay. There are no automatic generation retries.
- Uploads now use SDK Blob support instead of temporary local PDFs. Successful uploads are tracked for cleanup even if later uploads fail. All tracked deletions are attempted; cleanup failures fail the request and emit a fixed diagnostic code. SDK retries are disabled; generation/upload work has a 240-second abort signal and per-request timeouts. Deletion uses independent timeouts.

## Verification

- New unit tests: **33 passed** (contract failures, invalid upload batches, provider/JSON errors, cleanup paths, admission ordering, client/global limits).
- Full Vitest suite: **422 passed**, 21 files.
- Browser tests: **2 passed** — recover from extraction failure with documents preserved, and display HTTP 429 retry timing without automatic retries. The initial test selector also matched Next's route announcer; scoping it to the page main element fixed the test ambiguity.
- TypeScript: **PASS** after dependency refresh.
- ESLint for all changed TypeScript files: **PASS**.
- Content check: **PASS**, validates the existing two frozen forms/eight questions, not generated question quality.
- Secret scan: **PASS**, including all ten staged implementation/test files.
- Full `npm run verify`: **FAIL** at lint, with 54 pre-existing errors and 8 warnings outside the changed files. Five baseline lint errors were removed by this change; no lint rules were disabled.
- Production build: **PASS** (`next build --webpack`, including TypeScript and page generation).
- Bundle check: **PASS**. `check:prod-guard` script: **FAIL** because its `spawnSync("npm", ...)` returns `ENOENT` on this Windows host. Directly launching Next with Node verified that production rejects each of `E2E_EVALUATOR`, `NEXT_PUBLIC_USE_MOCKS`, and `DEBUG_LLM_PAYLOADS`: **all three PASS**. The script still needs a portable launcher.
- Live Gemini/File API calls this session: **0**. Provider schema acceptance, PDF processing readiness, and extraction quality remain unverified live.

## Follow-up priorities

1. Finish Phase 4 first: type and adapt generated questions through public DTOs, assessment, completed review, and comparison; add a non-recursion end-to-end regression. Remove the all-concepts/answer-key heuristic in favor of explicit question prerequisites and permitted answer fragments or another reviewed restricted-learner design.
2. Finish Phase 3: shared provider quota accounting (teaching plus extraction), token estimates/reservations, a durable queue, and a conservative persistent daily budget. Add status polling/recovery for Phase 2, including stale jobs and Gemini file readiness.
3. Clear inherited lint failures and restore the full verification gate. Then run a bounded live extraction against a synthetic study PDF to verify this model accepts the generated schema.
4. Deploy the Phase 5 limiter only as basic single-process protection. It resets on restart and is separate per replica. Configure a trusted proxy to overwrite forwarding headers; the global caps still apply if client identity is spoofed. Enforce an ingress body-size limit (the application Content-Length check cannot prevent oversized chunked bodies from being buffered). A total 200 MiB PDF payload also needs suitable hosting request-size/time limits.
5. Implement durable cleanup retry if immediate deletion must be guaranteed across provider outages or process termination. Current code attempts deletion and reports failure; it cannot guarantee deletion after a server crash or an upload whose response never arrived.

The historical destructive migration and Phase 4 incompatibilities were documented rather than expanded into an unrequested rewrite. This PR implements Phase 5; it does not certify the generalized app as demo-ready.
