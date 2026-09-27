# Evaluator remediation required before Phase 5A

Date: 2026-09-26
Gate commit: `c88c1405398b92badc2ec77f1a2371f23780c5dd`

## Decision

Phase 5A is **NO-GO**. The offline gates pass, but the merged live evidence does
not establish evaluator accuracy or live E2E consistency. Presentation polish
and deployment must wait for clean live evidence on the current code.

The authoritative live report is `docs/VERIFICATION_LIVE.md`. It tested
`96eb7c5`, before the Phase 4 audit fixes, and recorded only one scored held-out
output out of 54. It explicitly says the demo target is **NOT MET (unverified)**.
It also records live E2E as **N/A at 96eb7c5** and service smoke as blocked.

## Phase 5A gate evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| G1 | PASS | PR #9 is merged in main at `c88c140`. `npm run verify` passed on that commit: 404 tests in 18 files, production build, content, secret, and bundle checks. The bundle scan covered 14 client and 233 server files and found no scripted evaluator. |
| G2 | PASS | `npm run e2e:scripted` passed three consecutive runs on `c88c140`; each run passed Flow A and Flow B. These runs made zero Gemini calls. |
| G3 | FAIL | `docs/VERIFICATION_LIVE.md` reports only 1/54 required held-out outputs. `held.demo.cycle1` passed once, its second run was rate-limited, cycle 2 never ran, and the remaining fixtures never ran. The report says **NOT MET (unverified)**. |
| G4 | MISSING | Live E2E was **N/A at 96eb7c5**. There is no evidence that Flow A and Flow B on current main avoided `evaluator over-credit`. |
| G5 | FAIL | Live service smoke stopped at a failed evaluation. HTTP smoke passed through review, reload, replay, and cleanup. Both live smokes therefore did not pass. |
| G6 | FAIL | The audit correctly marked the earlier 54/54, 154-call, schema, and smoke claims unverified. The merged live report supersedes those claims with 1/54 held-out outputs, service smoke blocked, HTTP smoke passed, and 63–70 calls. The notes are not resolved because complete current-main verification is still absent. |

## Missing and failing fixture evidence

`returned=<not observed>` means Gemini returned no validated concept state for
that required run. It is missing evidence, not a zero-error result.

### Demo fixtures

| Fixture / required run | Concept | Expected state | Returned state |
| --- | --- | --- | --- |
| `held.demo.cycle1` run 1 | all five concepts | `recursive_call=demonstrated`; `smaller_subproblem=demonstrated`; `base_case=not_taught`; `progress_toward_base_case=not_taught|partially_taught`; `return_path=not_taught` | Matching validated states; scored PASS |
| `held.demo.cycle1` runs 2–3 | all five concepts | Same as run 1 | `<not observed>`; run 2 rate-limited and execution stopped |
| `held.demo.cycle2` runs 1–3 | all five concepts | `recursive_call=demonstrated`; `smaller_subproblem=demonstrated`; `base_case=demonstrated`; `progress_toward_base_case=partially_taught|demonstrated`; `return_path=not_taught|partially_taught` | `<not observed>` |

### Base-case safety coverage

The no-over-credit requirement applies to every held-out fixture. These
fixtures had no returned state in the merged live report:

| Fixtures | Concept | Expected state | Returned state |
| --- | --- | --- | --- |
| `held.base.01` through `held.base.10` | `base_case` | `demonstrated` | `<not observed>` for all three runs each |
| `held.wrong.keywords` | `base_case` | `not_taught|partially_taught` | `<not observed>` for all three runs |
| `held.negation` | `base_case` | any valid state | `<not observed>` for all three runs |
| `held.nplus1` | `base_case` | `partially_taught|demonstrated` | `<not observed>` for all three runs |
| `held.contradiction` | `base_case` | any valid state | `<not observed>` for all three runs |
| `held.retraction` | `base_case` | `partially_taught|demonstrated` | `<not observed>` for all three runs |
| `held.injection` | `base_case` | `not_taught` | `<not observed>` for all three runs |

There are no observed expected/returned state mismatches to diagnose. The
failure is incomplete live evidence. Treating unexecuted outputs as passing
would hide possible base-case over-credit.

## Likely cause

The live report identifies provider rate limiting on `gemini-3.8-flash` after
the first held-out output. The report also tested commit `96eb7c5`; the current
main includes the Phase 4 audit fixes and live E2E tests added afterward. This
leaves two separate gaps: insufficient provider capacity for the required live
sample, and no live consistency run against the code now proposed for Phase 5.

## Proposed fix

1. Select one supported model and record it before running any acceptance test.
   Confirm its project-level RPM, TPM, and RPD limits without printing the key.
2. Run the existing held-out suite three times on current main with one provider
   attempt per evaluation, conservative pacing, a hard call cap, and resumable
   reports. Do not edit the prompt, validator, rubric, or existing held-out set.
3. Run `smoke:service`, production `smoke:http`, and live Flow A and Flow B on
   the same commit and model. Record actual provider attempts or a conservative
   bound when the path cannot expose them.
4. If a real expected/returned mismatch appears, freeze the observed report and
   do not tune against its held-out text. Add the failure pattern to tuning using
   newly written text that expresses the same semantic class without copying or
   paraphrasing the held-out wording.
5. Before any retuning, author and commit a fresh `heldout-v2` set. It must be
   independently written, remain unopened during tuning, and preserve demo,
   base-case, negation, contradiction, retraction, and injection coverage.
6. Make the smallest prompt-only change justified by the new tuning case. Do
   not loosen Zod, provenance validation, fixture expectations, or gate logic.

## Clean re-validation protocol

1. Start from clean, current main and record its full hash, model name, and
   available call budget. Run `npm ci`, `npm run check:env`, and
   `npm run verify`.
2. Run `npm run e2e:scripted` three consecutive times. Any failure stops the
   live run.
3. If retuning was necessary, run tuning only against the expanded tuning set.
   Freeze the selected prompt in a commit before opening `heldout-v2` results.
4. Run `heldout-v2` three times. Acceptance requires both demo fixtures to pass
   every run and zero `base_case` over-credit across the entire set. Report every
   fixture/run, expected state, returned state, over-credit, and under-credit.
5. Run live Flow A and Flow B once each. Neither may emit
   `evaluator over-credit`; displayed scores and answers must match their pinned
   records.
6. Run both live smoke tests. Service and HTTP smoke must each reach completion,
   reload successfully, replay idempotently, and clean up their sessions.
7. Re-run `npm run verify`, confirm the protected paths are unchanged, and
   replace the contradictory historical claims with the new exact results.

No new evaluator behavior should be claimed until this protocol completes. The
Phase 5A deployment gate can then be rerun from its first step.
