"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { SessionProvider, useSession } from "@/hooks/useSession";
import { TeachPanel } from "@/components/TeachPanel";
import { ConceptMap } from "@/components/ConceptMap";
import { AssessmentPanel } from "@/components/AssessmentPanel";

/** Hydrate from the API on load. Scripted E2E swaps only the server evaluator. */
function Boot() {
  const { state, actions } = useSession();
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    void actions.hydrate();
  }, [actions, state.sessionId]);
  return null;
}

function VoiceToggle() {
  const { state, actions } = useSession();
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          checked={state.voice.enabled}
          onChange={() => actions.toggleVoice()}
        />
        Voice Output
      </label>
      {state.voice.speaking && <span aria-label="Speaking" className="text-xl leading-none">🗣️</span>}
    </div>
  );
}

function ErrorBanner() {
  const { state } = useSession();
  const err = state.errors.at(-1);
  if (!err) return null;
  return <p role="alert" className="rounded-md bg-red-50 px-3 py-1 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{err.message}</p>;
}

function SessionTitle() {
  const { state } = useSession();
  return (
    <div>
      <p className="eyebrow">{state.topic.name}</p>
      <h1>The Inverse Tutor</h1>
      <p className="session-subtitle">Teach it. Test it. Trace what changed.</p>
    </div>
  );
}

function HowItWorks() {
  return (
    <details open className="how-it-works">
      <summary>How the learner works</summary>
      <p>
        The learner is a simulation. Its answers come only from the teaching record verified from your own words, and
        its score reflects how well your explanation covers the concepts — not your own mastery.
      </p>
    </details>
  );
}

function LiveAnnouncer() {
  const { state } = useSession();
  const latestStudent = state.messages.filter((message) => message.role === "student").at(-1);
  const active = state.attempts.find((attempt) => attempt.id === state.activeAttemptId);
  const revealed = active && state.revealIndex > 0 ? active.results[state.revealIndex - 1] : undefined;
  let announcement = "";
  if (state.pending.teach) announcement = "Evaluating explanation.";
  else if (latestStudent?.evalStatus === "failed") announcement = "Failed to evaluate explanation.";
  else if (latestStudent?.evalStatus === "evaluated") announcement = "Evaluated explanation.";
  if (revealed) announcement = `Answer revealed: ${revealed.question.prompt}`;

  return <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>;
}

export default function SessionPage() {
  const params = useParams<{ id: string }>();
  const sessionId = typeof params.id === "string" ? params.id : "demo";

  return (
    <SessionProvider sessionId={sessionId}>
      <Boot />
      <LiveAnnouncer />
      <main className="session-shell">
        <header className="session-header">
          <SessionTitle />
          <div className="flex items-center gap-4">
            <VoiceToggle />
            <HowItWorks />
          </div>
          <ErrorBanner />
        </header>
        <div className="session-grid">
          <TeachPanel />
          <ConceptMap />
          <AssessmentPanel />
        </div>
      </main>
    </SessionProvider>
  );
}
