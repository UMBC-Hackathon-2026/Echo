"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
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
    <div className={`flex items-center gap-2 ${state.hydrated ? "" : "opacity-50"}`}>
      <label className="text-sm font-medium flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          checked={state.voice.enabled}
          onChange={() => actions.toggleVoice()}
          disabled={!state.hydrated}
        />
        Voice Output
      </label>
      {state.voice.speaking && <span aria-label="Speaking" className="text-xl leading-none">🗣️</span>}
    </div>
  );
}

function ErrorBanner() {
  const { state, actions } = useSession();
  const err = state.errors.at(-1);
  if (!err) return null;
  return (
    <div role="alert" className="error-toast">
      <span aria-hidden className="error-toast-icon">!</span>
      <p>{err.message}</p>
      <button type="button" onClick={() => actions.dismissErrors()} aria-label="Dismiss error">×</button>
    </div>
  );
}

const PHASE_LABELS: Record<string, string> = {
  teaching: "Teaching",
  assessing: "Assessing",
  reviewing: "Review",
  reteaching: "Reteaching",
  reassessing: "Reassessing",
  comparing: "Comparison",
};

function SessionTitle() {
  const { state } = useSession();
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="eyebrow">{state.hydrated ? state.topic.name : "Loading session"}</p>
        {state.hydrated && <span className="phase-chip">{PHASE_LABELS[state.phase] ?? "Session"} · Cycle {state.cycle}</span>}
      </div>
      <div className="flex items-center gap-2">
        <Image src="/echo-logo.png" alt="" width={32} height={32} priority className="echo-mark" />
        <h1>Echo</h1>
      </div>
      <p className="session-subtitle">Teach it. Test it. Trace what changed.</p>
    </div>
  );
}

function WorkspacePanels() {
  const { state, actions } = useSession();
  if (!state.hydrated) {
    const failed = state.errors.length > 0;
    if (failed) {
      return (
        <section className="panel-card session-load-error" aria-label="Session loading failed">
          <span aria-hidden>↻</span>
          <h2>We couldn&apos;t load this session</h2>
          <p>Your work is still safe. Check the connection and try loading the workspace again.</p>
          <button type="button" className="primary-button" onClick={() => void actions.hydrate()}>Retry loading session</button>
        </section>
      );
    }
    return (
      <div className="session-grid" aria-busy="true" aria-label="Loading session workspace">
        {["Teaching conversation", "Teaching record", "Assessment"].map((label, index) => (
          <section key={label} className="panel-card workspace-skeleton" aria-label={`Loading ${label.toLowerCase()}`}>
            <div className="skeleton-heading"><span>{index + 1}</span><i /></div>
            <i className="skeleton-line skeleton-line-wide" />
            <i className="skeleton-line" />
            <i className="skeleton-block" />
          </section>
        ))}
      </div>
    );
  }
  return (
    <div className="session-grid">
      <TeachPanel />
      <ConceptMap />
      <AssessmentPanel />
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
        <WorkspacePanels />
      </main>
    </SessionProvider>
  );
}
