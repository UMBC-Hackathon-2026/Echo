# The Inverse Tutor

> If you truly understand something, can you teach it well enough for someone else to use it?

## How it works

The Inverse Tutor flips the traditional model: students play the role of the teacher. You explain recursion to a simulated learner. The system then evaluates the explanation through a loop:
1. **Teach:** Submit an explanation.
2. **Assess:** The learner attempts to answer questions based strictly on your explanation.
3. **Inspect:** Trace mistakes directly to missed concepts and your original words.
4. **Reteach:** Clarify a missing idea or correct a misconception.
5. **Reassess:** The learner takes a new matched test to measure improvement.

## How the learner works

The learner is a **rubric-driven simulation**. 
- Gemini *only* evaluates the explanation against a strict rubric. 
- Code decides every answer deterministically based on the verified evidence from that evaluation. 
- The score reflects the explanation's coverage, not the student's mastery.

## Architecture

The application is a Next.js App Router application connecting to Tiger Data (PostgreSQL) and using Gemini for the evaluation. ElevenLabs is used to provide a synthesized voice for the simulated learner.

```mermaid
flowchart TD
    Client[Browser (React)] --> Next[Next.js App Router]
    Next --> DB[(Tiger Data / PostgreSQL)]
    Next --> Gemini[Gemini API]
    Next --> ElevenLabs[ElevenLabs TTS]
```

## Setup

**Prerequisites:** Node.js 20.19+ or 22.12+. PostgreSQL.

**Environment Variables (`.env.local`):**
- `GEMINI_API_KEY`: Get this from Google AI Studio.
- `GEMINI_MODEL`: e.g. `gemini-2.5-flash`.
- `DATABASE_URL`: PostgreSQL connection string for the development database.
- `DATABASE_URL_TEST`: PostgreSQL connection string for a separate database (the test suite wipes it).
- `ELEVENLABS_API_KEY`: Get this from the ElevenLabs dashboard.
- `ELEVENLABS_VOICE_ID`: A chosen voice ID from ElevenLabs.

**Database Setup & Migrations:**
You need two PostgreSQL databases. One for development (`DATABASE_URL`) and one for tests (`DATABASE_URL_TEST`).
Run migrations with: `npm run db:push` (and `cross-env DATABASE_URL=$DATABASE_URL_TEST npm run db:push`).

**Available Scripts:**
| Script | Description |
|---|---|
| `dev` | Starts the development server |
| `verify` | Runs lint, typecheck, tests, bundle size/secrets checks, and a production build |
| `test` | Runs Vitest regression tests (unit & integration) |
| `e2e:scripted` | Runs Playwright tests using a mocked deterministic evaluator |
| `e2e:live` | Runs Playwright tests against the live Gemini evaluator |
| `eval:live` | Runs standalone evaluator tests against the live Gemini model |
| `smoke:*` | Runs production smoke tests (`smoke:local`, `smoke:deployed`, `smoke:http`) |
| `check:*` | Runs specific checks (`check:secrets`, `check:content`, `check:bundle`, `check:env`, `check:prod-guard`) |

## Tests and verification results

The project includes strict deterministic testing and automated quality gates.
See [BUILD_PLAN.md](docs/BUILD_PLAN.md) and [VERIFICATION_LIVE.md](docs/VERIFICATION_LIVE.md) for the verified results.

## Sponsor usage

- **Gemini:** Used purely as an evaluator to extract rubric concepts from student text. 
- **ElevenLabs:** Used for Text-to-Speech (TTS) for the simulated learner. *(Speech-to-Text (STT) was intentionally omitted due to budget constraints and is not verified live).*
- **Tiger Data:** PostgreSQL database hosting for all session and attempt states.
- **DigitalOcean:** Production hosting for the application using the App Platform.

## Limitations

- The system currently only teaches a single subject (Recursion) using a hard-coded frozen rubric.
- The evaluation depends on the LLM's capability to correctly extract evidence.
- The voice STT is currently a known limitation.

## Proposed UMBC pilot

*Note: This pilot has not yet been run.*

We propose a study where introductory programming students at UMBC participate. Students will answer separate pre- and post-questions, alongside a comparison group. The simulated scores in this app measure explanation coverage, not learning gains. The true metric will be whether teaching the simulator improves their performance on the post-questions compared to the control group.

## Team and attribution

- Aahan (aahanrembersu07)
- Arik (arikgershman)
- Rajan (RajanAadi)
- William (wfderrick)

## AI-use disclosure

AI tools were heavily utilized during development:
- **Planning & Architecture:** Used Gemini chat and Google Antigravity to structure the immutable snapshots.
- **Coding Agents:** Built with autonomous agentic tools (Google Antigravity) completing PRs.
- **Verification:** AI was used to generate exhaustive deterministic tests and edge cases.
