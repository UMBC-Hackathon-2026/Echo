# Phase 5A gate — 2026-09-26

Decision: **NO-GO (incomplete held-out coverage)**. No presentation polish,
deployment, cloud provisioning, or voice work was performed.

Latest main: `c88c1405398b92badc2ec77f1a2371f23780c5dd` (PRs #8 and #9 merged).
Branch: `feat/phase-5a-polish-deploy`.
Verification fixes and live checks: `7e43e6acfd0a9529444e9b8693ec613d797f0470`.
Model: `gemini-3.1-flash-lite`, as selected by the user, free tier; no paid-tier
claim. Prompt p2 and rubric 1.0.2 were frozen throughout.

## Gate evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| G1 | PASS | PR #9 merged; verify passed on main and again with verification fixes: 404 tests in 18 files, build, content, secrets, bundle. |
| G2 | PASS | Strengthened scripted E2E passed three consecutive runs: 2/2 in 14.6s, 11.8s, 11.8s; zero Gemini calls. |
| G3 | MISSING | Both demo fixtures passed 3/3; all 34 scored outputs passed with zero base_case over-credit. Only 34/54 required outputs have been observed on this model/code. Twenty remain untested. Full demo target: **NOT MET (unverified)**. |
| G4 | PASS | Both live consistency flows passed once each (2/2, 27.2s), with no evaluator over-credit failure. Four provider calls. This establishes the observed runs only. |
| G5 | PASS | Service smoke passed in one call; production HTTP smoke passed in one call, including reload, idempotent response replay, database row count, and cleanup. Server stopped. |
| G6 | PASS (documentation reconciled) | VERIFICATION_LIVE.md distinguishes current results from the older 3.8-flash report. Earlier 54/54 and 154-call claims do not stand. Coverage remains incomplete under G3. |

## Held-out results

Command: `npm run eval:live -- heldout --runs 3 --max-calls 34 --max-attempts 1`.
Five-second delay between evaluations. No retries, provider failures, or scoring
mismatches. Stopped cleanly at `max_calls`; this is not a complete-suite pass.

| Fixture | Passed / scored | Required |
| --- | --- | --- |
| held.demo.cycle1 | 3/3 | 3 |
| held.demo.cycle2 | 3/3 | 3 |
| held.base.01 | 3/3 | 3 |
| held.base.02 | 3/3 | 3 |
| held.base.03 | 3/3 | 3 |
| held.base.04 | 3/3 | 3 |
| held.base.05 | 3/3 | 3 |
| held.base.06 | 3/3 | 3 |
| held.base.07 | 3/3 | 3 |
| held.base.08 | 3/3 | 3 |
| held.base.09 | 3/3 | 3 |
| held.base.10 | 1/1 | 3 |
| held.wrong.keywords | Not run | 3 |
| held.negation | Not run | 3 |
| held.nplus1 | Not run | 3 |
| held.contradiction | Not run | 3 |
| held.retraction | Not run | 3 |
| held.injection | Not run | 3 |

Overall: **34/34 scored (100%); coverage 34/54**. Over-credit: **0**;
under-credit: **0**; base_case over-credit: **0**, limited to observed outputs.
No concept/expected/returned-state mismatch was observed. Missing runs have no
returned state and must not be treated as passes.

Local resumable report:
`reports/eval-heldout-2026-09-27T03-41-42-393Z.json` (gitignored). It contains
per-run expected/returned states, calls, tested commit, and content fingerprint
`e363fb02ea95079601c90400170a7ef54aaa9265791265785396a4291dcc76e8`.
Successful live adapter returns passed its existing Zod/provenance validator;
the enriched schema was accepted. This does not retroactively verify the
historical standalone tuning-schema run.

## Fixes and verification

- Smoke scripts assert successful evaluation, base-case safety, probe presence,
  termination outcome/blocking, completed phase, and reload equality. Failures
  exit nonzero; HTTP replay also checks the stored attempt count. Both clean up.
- Service smoke uses one provider attempt and reports actual calls and latency
  (live success: 1,912ms).
- Live reports checkpoint evaluations, reject incompatible/legacy resumes,
  identify evaluator/rubric/fixture content, record event counts and coverage,
  and exit nonzero on scoring failures.
- Playwright refuses to reuse an existing server, retains failed traces, and
  explicitly asserts that teaching was evaluated successfully.
- A negative HTTP check against an unreachable local target exited 1 with zero
  Gemini calls.

| Phase 5A requirement | Result |
| --- | --- |
| verify / check:env / check:secrets | PASS; both PostgreSQL 18 connections work |
| Scripted E2E three consecutive runs | PASS |
| Production bundle excludes scripted evaluator | PASS; 14 client + 233 server files |
| docs/source, lib/content, lib/evaluator, fixtures/evaluator unchanged | PASS against current main |
| Layout, accessibility, keyboard-only path, demo helper, screenshots | BLOCKED by G3; not implemented or claimed |
| Production forbidden-variable guard test | BLOCKED; not implemented |
| Deployment configuration and DEPLOY.md | BLOCKED; no provisioning or deployment |
| Deployed verification | BLOCKED; no deployed URL |
| Gemini call cap | PASS: **40/40** |

Call accounting: service **1** + live E2E **4** + HTTP **1** + held-out **34** =
**40**. Local fetch instrumentation counted provider requests without logging
payloads or credentials and enforced the cap and five-second minimum spacing.
Offline checks and scripted E2E used zero calls. Local ledger:
`reports/phase5-calls.json`.

## Skills

Found installed Playwright skills: playwright-cli, playwright-component-testing,
playwright-trace. Applied playwright-cli and its test-running reference. Found
user system skills: imagegen, openai-docs, plugin-creator, review-agent,
skill-creator, skill-installer. Skipped those and the other Playwright skills as
not needed. No repo-authored frontend/design skill was found.

## Required next action

Authorize **20 additional Gemini calls** to finish the frozen held-out run.
No credential or database repair is needed based on these checks. With the
saved report still the newest held-out report, resume using:

```sh
npm run eval:live -- heldout --runs 3 --resume --max-calls 20 --max-attempts 1
```

Do not execute under the exhausted current-session allowance. Any provider
failure may require another separately approved allowance. If a scoring mismatch
appears, follow EVALUATOR_REMEDIATION.md; do not tune against observed held-out
texts. If all remaining checks pass, rerun the Phase 5A gate before polish and
deployment. Do not create a DigitalOcean app yet.

Production dependency audit: zero vulnerabilities. Four moderate development
warnings remain in the drizzle-kit/esbuild chain; npm proposes a breaking
downgrade, which was not applied during gate repair.
