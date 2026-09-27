# Live Verification — 2026-09-26

## Latest follow-up: Phase 5A gate repair

Current results are in [PHASE5.md](PHASE5.md), verified at `7e43e6a` on main
`c88c140` plus verification-script fixes, using the user's selected
`gemini-3.1-flash-lite` and frozen p2/rubric 1.0.2. **34/34 scored held-out outputs
passed, coverage 34/54**; both demo fixtures passed 3/3; zero observed over-credit
or under-credit. Both live E2E flows and both live smoke tests passed. Total
calls: **40**, the session allowance. Twenty outputs remain untested, so the
overall demo target is **NOT MET (unverified)**. Earlier 54/54 and 154-call claims
do not stand. No evaluator or fixture retuning occurred.

The remainder preserves the older `96eb7c5` / 3.8-flash report as historical
evidence; its results must not be combined with this follow-up.

## Scope

| Field | Value |
| --- | --- |
| Results branch | `verify/live-2026-09-26` |
| Exact commit tested | `96eb7c54d2e5f9e250e1f2055a6960e86526cae0` |
| Base branch | `main` |
| Model required and used for the valid pass | `gemini-3.8-flash` |
| Origin movement | No. `origin/main` was `96eb7c54d2e5f9e250e1f2055a6960e86526cae0` before and after verification. |
| Verification type | Live verification only; no application code, prompts, fixtures, validation, or assertions changed. |

The checkout was clean with no local-only commits at preflight. The configured SSH
remote could not authenticate, so the required fetch and fast-forward-only pull
were performed against the public HTTPS URL. `main`, `origin/main`, and the tested
commit all matched before detaching at `96eb7c5`.

Runs 4 and 5 do not exist at this commit and are recorded as **N/A at 96eb7c5**,
per the pass override.

## Setup

| Step | Result | Raw evidence |
| --- | --- | --- |
| Clean tree / no local commits | PASS | `main...origin/main`, both at `96eb7c5` |
| `git fetch --all --prune --tags` equivalent | PASS | Public HTTPS fetch used because SSH returned `Permission denied (publickey)` |
| `git pull --ff-only` | PASS | `Already up to date.` |
| Detach exact commit | PASS | `HEAD=96eb7c54d2e5f9e250e1f2055a6960e86526cae0` |
| `npm ci` | PASS | 463 packages installed; audit reported 4 moderate vulnerabilities |
| `git config core.hooksPath .githooks` | PASS | Readback: `.githooks` |
| `npm run check:env` | PASS | Both distinct PostgreSQL 18 databases passed TLS `SELECT 1`; measured 189 ms and 207 ms on the final check |
| `npm run db:migrate` — `DATABASE_URL` | PASS | `db:migrate OK` |
| `npm run db:migrate` — `DATABASE_URL_TEST` | PASS | `db:migrate OK` with the test URL temporarily mapped to the script's `DATABASE_URL` input |
| `npm run verify` | PASS | Lint; type generation/typecheck; 394 tests in 16 files; content, secret, production build, and bundle checks |

The initial local model value was discovered to be `gemini-3.1-flash-lite`, not
the `gemini-3.8-flash` value recorded in `docs/PHASE3.md`. Results from that first
live attempt were discarded as acceptance evidence. Only the ignored local
`.env.local` model setting was corrected; no tracked application file changed.
The required live checks were then repeated on `gemini-3.8-flash`. The discarded
attempt is included only in the whole-session Gemini call ledger below.

## Run 1 — evaluator accuracy

Command:

```text
npm run eval:live -- heldout --runs 3 --max-calls 240
```

Planned: 18 fixtures x 3 runs = 54 evaluations and at most 54 Gemini calls.
Observed: the first fixture/run passed, then the second call returned
`rate_limited`; the runner stopped and saved its partial report. Two calls were
made. There were no returned concept states for the rate-limited call.

| Fixture | Required | Scored | Passed | Pass rate of scored runs | Over-credit | Under-credit | Result |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| `held.demo.cycle1` | 3 | 1 | 1 | 100.0% | 0 | 0 | Incomplete; run 2 rate-limited |
| `held.demo.cycle2` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| `held.base.01` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| `held.base.02` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| `held.base.03` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| `held.base.04` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| `held.base.05` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| `held.base.06` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| `held.base.07` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| `held.base.08` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| `held.base.09` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| `held.base.10` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| `held.wrong.keywords` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| `held.negation` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| `held.nplus1` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| `held.contradiction` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| `held.retraction` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| `held.injection` | 3 | 0 | 0 | N/A | N/A | N/A | Not run |
| **Overall** | **54** | **1** | **1** | **100.0% of scored runs (1/1)** | **0** | **0** | **Incomplete** |

### Credit counts by concept

These counts cover only the single scored output; unexecuted outputs are not
treated as zero-error evidence.

| Concept | Over-credit | Under-credit |
| --- | ---: | ---: |
| `recursive_call` | 0 | 0 |
| `smaller_subproblem` | 0 | 0 |
| `base_case` | 0 | 0 |
| `progress_toward_base_case` | 0 | 0 |
| `return_path` | 0 | 0 |

### Failing fixtures

`held.demo.cycle1`, run 2, did not return a state because the provider returned
`rate_limited`. Expected states were:

```text
recursive_call=demonstrated
smaller_subproblem=demonstrated
base_case=not_taught
progress_toward_base_case=not_taught|partially_taught
return_path=not_taught
returned=<none; rate_limited>
```

There were no scored expected/returned mismatches.

### Demo target

**NOT MET (unverified).** Cycle 1 passed only 1 of the required 3 runs, cycle 2
did not run, and only one held-out output was scored. That scored output did not
over-credit `base_case`, but the required full condition was not executed.

## Run 2 — service smoke

| Step | Result | Evidence |
| --- | --- | --- |
| Create session | PASS | Session created in `teaching` phase |
| Teach cycle 1 | FAIL/BLOCKED | `teach eval status: failed`; script printed `BLOCKED: evaluation not successful (failed) — likely quota/rate limit.` |
| Verify `base_case` / probe | NOT RUN | Blocked by failed evaluation |
| Create assessment | NOT RUN | Blocked by failed evaluation |
| Complete / reload | NOT RUN | Blocked by failed evaluation |
| Cleanup | PASS | Disposable smoke session deleted |

The script exited zero even though its printed evaluation status was failed. The
printed status is treated as authoritative. Whole-command wall time: 3.56 s.

## Run 3 — production build and HTTP smoke

| Step | Result | Evidence |
| --- | --- | --- |
| `npm run build` | PASS | Next.js 16.3.6 production build completed |
| `npm start` | PASS | Ready on localhost; server stopped after the run |
| Create session | PASS | HTTP 201 |
| Teach cycle 1 | PASS | HTTP 200, `eval=evaluated` |
| Base-case state | PASS | `base_case=not_taught` |
| Learner probe | PASS | `probe=base_case` |
| P1 result | PASS | `misconception`; blocking concepts `base_case`, `progress_toward_base_case`; blocking belief `recursion_runs_forever` |
| Complete attempt | PASS | HTTP 200, phase `reviewing` |
| Reload | PASS | `reload identical=true` |
| Duplicate attempt replay | PASS | HTTP 200; no new row expected |
| Cleanup | PASS | Disposable smoke session deleted |

Whole-command wall time: 5.20 s.

## Runs 4 and 5 — E2E

| Run | Result |
| --- | --- |
| Deterministic E2E | **N/A at 96eb7c5** |
| Live E2E | **N/A at 96eb7c5** |

No E2E video or trace exists at this commit because the overridden instructions
explicitly excluded both E2E runs.

## Run 6 — browser checklist

This was an agent-driven browser check, not a human observer.

| Check | Result | Evidence / notes |
| --- | --- | --- |
| Start session | PASS | Home created and navigated to a new session |
| Starting-belief label | PASS | UI showed `the learner's starting belief`, not `the student's` |
| Double activation / idempotency | PASS | First keyboard activation submitted; the immediate second activation was blocked after the button disabled; exactly one student turn appeared |
| Cycle-1 teach without base case | FAIL/BLOCKED | Student turn became `[Evaluation failed]`; record stayed v0 |
| Failed-evaluation UI | PASS | `Retry` was visible; assessment was disabled with `Resolve the pending or failed explanation first.` |
| Retry | FAIL/BLOCKED | Retry completed back in `[Evaluation failed]` |
| Base-case review with quoted words | BLOCKED | Cycle 1 never evaluated on the required model |
| Review refresh persistence | BLOCKED | Review was unreachable; refreshing the failed state did restore the same URL, failed turn, v0 record, and disabled assessment |
| Reteach base case | BLOCKED | Review was unreachable |
| Form B and comparison | BLOCKED | Reteach was unreachable |
| Start a new session | PASS | A second fresh session opened at record v0 |

No visually broken layout was observed on the home, teaching, or failed-evaluation
screens reached. Browser automation pointer/semantic clicks did not consistently
activate buttons, while keyboard activation did; this is recorded as a confusing
interaction observation, not proven as an application defect.

Supplemental, non-gate observation from the discarded wrong-model run: cycle 1
did evaluate and review persisted across refresh, but a cycle-2 reteach submission
returned `State changed — resynced.` three times, including after a full reload.
A read-only database check showed `phase=reteaching`, `cycle=2`, `revision=5` and
only four messages (opening learner, one evaluated cycle-1 student turn, probe,
and reteach prompt). This observation is not counted as valid acceptance evidence
because that run used the wrong model.

## Run 7 — timing

The smoke scripts at this commit do not print the evaluator's `latencyMs`, and the
overridden E2E runs are absent. Therefore an isolated teach-submission median and
maximum cannot be computed from smoke/E2E logs.

| Measurement | Median | Maximum | Raw evidence |
| --- | ---: | ---: | --- |
| Teach submission latency from smoke/E2E logs | N/A | N/A | No per-teach latency field in smoke output; E2E N/A at `96eb7c5` |
| Whole service-smoke command | 3.56 s | 3.56 s | One run; evaluation failed |
| Whole HTTP-smoke command | 5.20 s | 5.20 s | One run; evaluation passed |

The whole-command values include process startup, database work, and cleanup and
must not be represented as isolated teach latency.

## Gemini call ledger

The runner reports exact provider-call counts. The smoke and browser paths at
this commit expose only success/failure and allow up to two provider attempts per
evaluation; they do not expose the actual `attempts` count. For that reason the
whole-session total is an honest bounded range rather than a fabricated scalar.

| Operation | Model | Gemini calls |
| --- | --- | ---: |
| Discarded evaluator run | `gemini-3.1-flash-lite` | 54 exact |
| Discarded service smoke | `gemini-3.1-flash-lite` | 1–2 |
| Discarded HTTP smoke | `gemini-3.1-flash-lite` | 1–2 |
| Discarded browser cycle-1 teach | `gemini-3.1-flash-lite` | 1–2 |
| Valid evaluator run | `gemini-3.8-flash` | 2 exact |
| Valid service smoke | `gemini-3.8-flash` | 1–2 |
| Valid HTTP smoke | `gemini-3.8-flash` | 1–2 |
| Valid browser cycle-1 teach | `gemini-3.8-flash` | 1–2 |
| Valid browser retry | `gemini-3.8-flash` | 1–2 |
| **Whole session total** |  | **63–70 / 300** |

No secrets or database URLs are included in this report.

## Final result

Setup and the non-live repository verification passed. The evaluator accuracy
gate and service smoke are blocked by live provider rate limiting on the required
model. HTTP smoke passed. The valid browser run exercised and persisted the
failure path but could not reach review/reteach/comparison. Runs 4 and 5 are
**N/A at 96eb7c5** as required.
