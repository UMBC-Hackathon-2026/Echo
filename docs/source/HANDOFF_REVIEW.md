# The Inverse Tutor reviewed architecture and implementation handoff

Start implementing The Inverse Tutor now, using the attached technical architecture as the baseline and the corrections below as authoritative updates. This request supersedes the earlier scaffold-only limit: build the working application through the phases below. Complete each phase's acceptance criteria and continue to the next phase without stopping merely to ask whether to proceed.

The product is a learning app where a student teaches a simulated AI learner, watches it take an assessment, inspects mistakes against their original explanation, reteaches missing concepts, and compares a second attempt. The first topic is recursion for UMBC introductory programming students. Primary tracks: Community Impact and Social Innovation, Best Entrepreneurial Idea, and Most Engaging Demo. Sponsor targets: Gemini API and ElevenLabs when those integrations are actually working.

## Scope and repository

The confirmed project root is C:\Users\aahan\Desktop\UMBC. Its existing GitHub remote is https://github.com/aahanrembersu07/inverse-tutor.git. Work directly in this existing checkout. Do not create another inverse-tutor directory or work in the Research folder. At review time the repository was on main with a clean working tree and scaffold/deployment commits already present; recheck its live state before editing.

- Inspect the existing inverse-tutor repository, its instructions, current branch, remote, and working changes before editing. Continue completed work and preserve teammates' changes. Do not recreate an existing scaffold or modify pt-form-coach.
- If the confirmed project path is unavailable, report the path problem rather than creating a replacement repository elsewhere.
- Read AGENTS.md and the relevant installed Next.js guides under node_modules/next/dist/docs/ before code changes, as required by this project's instructions. The inspected scaffold uses Next.js 16.3.6, React 19.2.8, and Tailwind 4. It does not yet declare the Gemini SDK, ElevenLabs SDK, Zod, Drizzle, or pg in package.json; verify and add the needed dependencies during the appropriate phase.
- Record the revised architecture and phase checklist in docs/ARCHITECTURE.md and docs/BUILD_PLAN.md. Record implemented status and actual validation results as work proceeds.
- Verify GitHub authentication and the intended remote before pushing. Use normal pushes to a feature branch when collaborating; keep main working. Follow the repository's established workflow.
- Ask early for missing credentials through the environment/secret mechanism, never in committed files. Continue work that does not depend on those credentials. Explicitly report any integration that could not be tested live.

## Architecture to retain

- Next.js App Router, TypeScript, Tailwind, Zod, PostgreSQL, and Drizzle if already installed.
- One /session/[id] page with TeachPanel, ConceptMap, AssessmentPanel, and review/comparison views controlled by server-enforced phases.
- Gemini evaluates explanations against a rubric. The application validates output and saves immutable learning-record snapshots.
- Each assessment attempt pins a particular learning-record ID. Later teaching must not change a past attempt or its evidence.
- Typed interaction comes first. The visual trace from a failed answer to a concept and the student's quoted words is essential functionality.
- Use current official SDKs: @google/genai and @elevenlabs/elevenlabs-js. Confirm model availability and structured-output support for the installed SDK; keep the selected model configurable. Do not assume temperature zero guarantees identical results.

## Required corrections before completing the core loop

### 1. Be precise about what the assessment demonstrates

The deterministic learner is a rubric-driven simulation. Its assessment score is computed from the recorded teaching evidence; it is not an independent test proving human learning or autonomous model generalization. Keep the assessment experience, but explain this mechanism plainly in the README and an unobtrusive product explanation. Present the UMBC evaluation as a proposed pilot. The pilot needs separate questions answered by students before and after practice; simulated learner score gains are not human learning gains.

### 2. Make every displayed answer consistent with the record

Replace the document's one canned answer per outcome with answer fragments or variants whose prerequisites are explicit. The current incomplete answer says the input gets smaller even when only base_case is partially taught and smaller_subproblem is not taught.

- Associate each answer fragment and scoring criterion with the exact facts or concepts required to support it.
- Select only supported fragments. Use an uncertainty response where the record provides no support.
- Distinguish partially_taught from demonstrated; merely mentioning one required concept must not earn a generic partial point or unlock a factual answer about another concept.
- Define handling for relevant active misconceptions. The document's touched branch currently hides the misconception branch. An unresolved contradictory belief must not disappear just because another required concept was mentioned.
- Track whether a misconception was seeded for the learner or introduced by the student, its evidence, and when it was resolved or reactivated. Do not attribute a seeded belief to the student.
- Handle the all-correct path explicitly: no blocking concept means no next-step remediation prompt.
- Score authored criteria consistently with the displayed answer. Keep direct concept evidence distinct from question-level performance; a multi-concept question failure must not label every involved concept as failed.

For the MVP, use authored answer templates without an LLM phraser. A keyword blacklist cannot guarantee that paraphrasing adds no new fact. ElevenLabs can speak the approved text directly. Gemini is already meaningfully used in the evaluator.

### 3. Strengthen evidence validation

- Require exactly one entry for each of the five allowed concepts. Reject duplicate/unknown IDs and invalid states; define a conservative fallback for missing entries.
- Require nonempty evidence for partial or demonstrated states. An empty string must never pass substring verification.
- Verify evidence against the exact cited student turn. Do not silently search all turns when the ID is wrong.
- Preserve punctuation and code operators. Stripping punctuation can make n + 1 and n - 1 match incorrectly. Prefer original-text character spans with exact quote checks; allow only clearly specified benign normalization.
- Support a small bounded list of evidence spans when a concept was explained across multiple student turns.
- Treat quote verification as provenance, not proof of semantic correctness. Test negation, incorrect explanations containing the right keywords, and contradictory statements.
- Define correction behavior: an explicit later retraction can supersede earlier evidence; unresolved contradictions should remain uncertain rather than accumulate into demonstrated status. Preserve the history.
- Use pre-authored, concept-targeted follow-up questions for the MVP. Permit a null question when all concepts are covered. Template probes should avoid stating the missing rule themselves.
- Keep student text separate from evaluator instructions. Include adversarial fixtures such as a student asking the evaluator to mark all concepts demonstrated.

### 4. Fix assessment content and comparisons

- Build forms A and B independently of the student's explanation and freeze them before a session starts. Never provide answer keys to the evaluator.
- Match pairs on concept coverage, number of reasoning steps, prerequisites, and intended difficulty. Identical requires tags alone do not establish comparable difficulty. In particular, reconsider list length versus string reversal.
- Specify inputs and assumptions for each code sample. For example, countdown with n - 1 reaches zero for nonnegative integer inputs; do not claim it does for arbitrary inputs.
- Store form/question-bank version and gate/scoring version with attempts, alongside rubric version. Preserve question/key snapshots or immutable historical content so reviews stay reproducible after content changes.
- Pair comparison rows using explicit pair IDs. Describe forms as designed to be comparable, pending learner testing.
- Conduct learner follow-up questions only during teaching. Assessment runs use the frozen record without additional teaching.

### 5. Complete phases, concurrency, and persistence

Define all server transitions and their endpoints, including beginning reteaching, completing an attempt, and starting a fresh session. The supplied API table omits the operation that increments the cycle and enters reteaching.

- Use explicit allowed transitions for teaching -> assessing -> reviewing -> reteaching -> reassessing -> comparing, including the chosen behavior for later cycles.
- Check expected session/record version and use idempotency keys for teaching, attempt creation, and answers. Repeated requests should return the stored result rather than duplicate it or charge another model call unnecessarily.
- Persist turn numbering, record version, and phase changes atomically. Do not hold a database transaction open while waiting for Gemini. Finalize only if the expected session revision is still valid; handle stale evaluation results explicitly.
- Enforce that records, messages, and attempts referenced together belong to the same session, both in application checks and suitable database constraints.
- Mark attempts complete only when all expected results are persisted. Reloading should restore completed answers and resume unfinished work.
- On evaluator failure, preserve the submitted text and visibly mark it pending/failed. A stale previous record must not appear to include the new explanation. Block a fresh assessment until evaluation succeeds or the student explicitly chooses an identified earlier snapshot.
- Use a single total retry/time budget per operation. Avoid compounded nested retries. Honor provider backoff guidance; do not rotate credentials to bypass quotas.

### 6. Keep the public demo contained

API keys, rubrics with answer keys, and database credentials stay server-side. Return explicit public DTOs rather than full server objects. For anonymous sessions, use a secure owner cookie/token and verify ownership on every session/attempt route. An exposed session UUID alone is not sufficient access control. Add input limits and basic rate limits to paid API endpoints. Avoid logging complete student transcripts or secrets in production; retain debugging payloads only when explicitly enabled with a retention plan.

### 7. Simplify integrations and align the documentation

- Gemini: core evaluator, one bounded call per submitted explanation, with validation and truthful failure states.
- PostgreSQL/Tiger Data: choose the database provider early; the database is necessarily on the core request path. Verify connectivity, TLS, and migrations rather than assuming a URL change is always sufficient.
- ElevenLabs: add TTS after the typed loop passes. Display text immediately; let users mute, replay, or cancel speech. If STT is added, show an editable transcript before submission. Browser Web Speech has limited compatibility and can depend on an external service; do not claim it is an offline fallback.
- DigitalOcean: validate the production build/deployment configuration early, then deploy the completed core before optional voice work. Provide deployment configuration without provisioning billable resources unless authorized.
- Backboard: defer until the core is finished. If added, give it a visible return-session feature and isolated per-student memory. Use a supported after-response mechanism or an outbox with error handling, not an unawaited promise in a request handler.
- Omit Snowflake and Solana from the MVP. They solve no required problem in this implementation.
- Align architecture diagram labels with actual routes and providers; the document currently shows GET /review and ElevenLabs speech input while the endpoint plan differs.
- Replace the architecture instruction to author questions before the event with independently authoring and freezing them before evaluation. Preserve accurate development dates and follow the event's prior-work rules.

## Implementation phases and acceptance criteria

### Phase 1 — Contracts, rubric, and scaffold

Inspect the existing project, write the revised plan, establish Zod/domain contracts, author the five recursion concepts and matched assessment forms, and set up lint/typecheck/build scripts and CI. Add interfaces for evaluator and persistence plus clearly identified test fixtures. Render the session layout with mocked data only in development.

Acceptance: the app builds; question-bank validation passes; answer keys and secrets are absent from client bundles/DTOs. Commit the coherent units as completed.

### Phase 2 — Deterministic learner and evidence validation

Implement the revised gate, answer fragments/templates, criterion scoring, misconception lifecycle, and provenance validation as pure functions. Write targeted tests for no teaching, partial teaching, full teaching, unsupported fragments, empty evidence, wrong turn IDs, n+1 versus n-1, contradictions, and relevant misconceptions. Exhaustively test the 3^5 concept-state combinations where applicable; no live model calls are needed for these tests.

Acceptance: displayed answers and scores agree for the supported question bank, and all targeted tests pass. Commit gate, validation, and tests in meaningful units.

### Phase 3 — Persisted typed loop and live evaluator

Apply migrations to a development database, implement owner-scoped routes, phase transitions, immutable snapshots, idempotency, and the Gemini adapter. Bind the frontend to the real API. Implement session hydration and visible pending/error states. Evaluate a small fixture set containing both correct and deliberately wrong explanations; separate fixtures used for prompt tuning from held-out checks.

Acceptance: a fresh explanation reaches Gemini, validated state is persisted, an assessment pins that state, and refresh restores the session. Duplicate requests do not duplicate records or attempts. Report live tests as blocked if credentials are unavailable; fixtures are not a substitute for claiming live success.

### Phase 4 — Review, reteaching, and comparison

Implement the full review row and cross-panel highlights. Add explicit reteach transition, a second distinct form, and before/after comparison using the frozen records. Include empty-evidence behavior and a fresh-session action.

Acceptance: a student omits the base case, sees the resulting deficiency, teaches the correction, and sees the second attempt change. An earlier attempt remains unchanged. Also verify an incorrect reteaching explanation does not automatically improve the result. Run an end-to-end browser check and capture the core demo video.

### Phase 5 — Presentation quality, deployment, and voice

Polish legibility, keyboard access, state labels beyond color alone, loading/error behavior, and the three-panel layout. Use subtle animation to reveal real persisted answers; do not invent processing or success. Deploy and smoke-test the core when credentials/hosting are available. Add ElevenLabs TTS with clean failure handling, followed by STT only if time permits.

Acceptance: the core flow works on the demo device, voice failure does not interrupt teaching or assessment, and the team can demonstrate it in 3-5 minutes. Retest the deployed build rather than assuming localhost proves deployment.

### Phase 6 — Submission and handoff

Finish README, setup/migration instructions, environment example, architecture explanation, demo steps, sponsor usage, limitations, and proposed UMBC pilot evaluation. Include actual screenshots and the video link when available. Verify repository visibility and report collaborator access versus pending invitations. Preserve accurate attribution and AI-use disclosures as applicable.

Acceptance: a teammate can install and run the app from documented instructions; lint, typecheck, relevant tests, and production build pass. Summarize actual completed features, live integrations verified, remaining blockers, commit hashes, and deployment/video links.

## Commit and collaboration requirements

Make frequent, meaningful commits as working pieces are completed. A typical phase should produce several commits when it contains separate changes, but there is no artificial count target. Commit subjects should describe the actual change, for example:

- feat: define recursion rubric and paired assessment forms
- feat: constrain learner answers to supported concept fragments
- fix: preserve code operators when verifying teaching evidence
- feat: freeze learning records for assessment attempts
- feat: link assessment failures to teaching evidence
- feat: compare assessment attempts after reteaching
- feat: add optional ElevenLabs learner speech
- docs: add setup instructions and hackathon demo walkthrough

Inspect staged diffs, stage only owned task files, run checks appropriate to each change, and push completed checkpoints to the verified remote. Keep main demonstrable and respect teammates' branches and uncommitted changes. Use truthful authorship and timestamps. Never fabricate activity, backdate commits, create empty filler commits, or split trivial edits merely to inflate the graph. The history should let teammates and judges understand how the project was built.

Do not spend the turn only planning. Begin with repository inspection and Phase 1, then continue through the phases. If a credential or external service blocks one feature, report the exact dependency and continue independent authorized work. At each phase checkpoint, briefly report working behavior, validation results, relevant commits, and the next phase.

## Reference links

- Gemini structured outputs and validation: https://ai.google.dev/gemini-api/docs/structured-output
- Official Gemini SDK: https://ai.google.dev/gemini-api/docs/libraries
- Official ElevenLabs Node SDK: https://elevenlabs.io/docs/api-reference/introduction
- Next.js after-response work: https://nextjs.org/docs/app/api-reference/functions/after
- Browser speech recognition limitations: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- hackUMBC event guidance: https://www.hackumbc.tech/
