# The Inverse Tutor

> If you truly understand something, can you teach it well enough for someone else to use it?

## The idea

Most tutoring tools check whether *you* can answer questions. The Inverse Tutor flips
that around: **you teach the machine**, and we measure how well it can then *use* what
you taught. You write an explanation of a concept; a deliberately **restricted AI
learner** — one with no prior knowledge of the topic — tries to solve transfer problems
using only your explanation. Where it stumbles is exactly where your understanding (or
your teaching) has gaps.

## Problem statement

Learners routinely mistake familiarity for understanding. Passive recognition ("yeah,
I've seen recursion") collapses the moment they have to explain it precisely enough for
someone else to act on. There's no fast, low-stakes way to surface that gap. The Inverse
Tutor makes the gap visible: it turns "explain it" into a concrete, gradable signal by
having a knowledge-restricted agent attempt to apply the explanation, scored against an
explicit rubric.

## How it works

1. **Teach** — You explain a concept (the seed concept is **recursion**) in the `TeachPanel`.
2. **Evaluate** — A Gemini-backed evaluator scores your explanation against a rubric of the
   things a correct explanation must contain.
3. **Learn** — A restricted learner agent, allowed to rely *only* on your explanation,
   attempts questions from a question bank.
4. **Assess** — The `AssessmentPanel` and `ConceptMap` show where the learner succeeded and
   where your teaching left gaps, so you can revise and try again.

## Tech stack

- **Next.js (App Router)** + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Google Gemini** — evaluator + restricted learner
- **PostgreSQL** — sessions, explanations, concept states, assessment history
- **ElevenLabs** *(optional)* — spoken explanations

## Project structure

```
app/                      Next.js App Router entry
components/
  TeachPanel/             Where the human explains a concept
  ConceptMap/             Visualizes evolving concept mastery
  AssessmentPanel/        Shows restricted-learner results
lib/
  evaluator/              Gemini evaluator (scores explanations vs. rubric)
  learner/                Restricted learner (answers using only the explanation)
  rubric/                 Recursion rubric + question bank
  db/                     PostgreSQL client + schema migrations
```

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure environment** — copy the example and fill in your keys:
   ```bash
   cp .env.example .env.local
   ```
   Set `GEMINI_API_KEY` and `DATABASE_URL` (and optionally `ELEVENLABS_API_KEY`).
3. **Set up the database** — create a PostgreSQL database and apply the migration:
   ```bash
   psql "$DATABASE_URL" -f lib/db/migrations/001_init.sql
   ```
4. **Run the dev server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Deploying to DigitalOcean

The repo includes an App Platform spec at [`.do/app.yaml`](.do/app.yaml).

1. **Connect the repo** — In the DigitalOcean dashboard, create a new App and connect
   this GitHub repo (`aahanrembersu07/inverse-tutor`, branch `main`). App Platform will
   detect the Next.js app; the spec sets `npm run build` / `npm start` and port `8080`.
2. **Set the environment variables** — In the app's **Settings → App-Level / Component
   Environment Variables**, add the three secrets (they are declared as `SECRET`
   placeholders in the spec, with no values committed):
   - `GEMINI_API_KEY`
   - `DATABASE_URL`
   - `ELEVENLABS_API_KEY`
3. **Attach a database** — The app needs a **managed PostgreSQL database** (a DO Managed
   Database, or **Tiger Data**) provisioned and attached **before it will run**. Point
   `DATABASE_URL` at that database and apply `lib/db/migrations/001_init.sql` to it.

## Status & scope

This is an early hackathon-stage project. It **proposes a pilot with UMBC** to study whether
teach-to-an-AI-learner improves conceptual understanding; it does **not** claim proven
learning gains. The rubric, question bank, and learner constraints are the levers we'd
validate in that pilot.
