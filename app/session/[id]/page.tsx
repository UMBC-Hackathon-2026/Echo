"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { SessionProvider, useSession } from "@/hooks/useSession";
import { TeachPanel } from "@/components/TeachPanel";
import { ConceptMap } from "@/components/ConceptMap";
import { AssessmentPanel } from "@/components/AssessmentPanel";

const USE_MOCKS = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_USE_MOCKS === "true";

/** Hydrate from the real API on load; use dev mocks only behind the explicit flag. */
function Boot() {
  const { state, actions } = useSession();
  useEffect(() => {
    if (USE_MOCKS) {
      import("@/fixtures/dev/mockSession").then(({ buildMockSession }) => actions.hydrateFrom(buildMockSession(state.sessionId)));
    } else {
      void actions.hydrate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions]);
  return null;
}

function ErrorBanner() {
  const { state } = useSession();
  const err = state.errors.at(-1);
  if (!err) return null;
  return <p role="alert" className="rounded-md bg-red-50 px-3 py-1 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{err.message}</p>;
}

function HowItWorks() {
  return (
    <details className="text-xs text-zinc-500">
      <summary className="cursor-pointer">How the learner works</summary>
      <p className="mt-1 max-w-2xl">
        The learner is a simulation. Its answers come only from the teaching record verified from your own words, and
        its score reflects how well your explanation covers the concepts — not your own mastery.
      </p>
    </details>
  );
}

export default function SessionPage() {
  const params = useParams<{ id: string }>();
  const sessionId = typeof params.id === "string" ? params.id : "demo";

  return (
    <SessionProvider sessionId={sessionId}>
      <Boot />
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">The Inverse Tutor</h1>
          <p className="text-sm text-zinc-500">Teach → assess → review</p>
          <HowItWorks />
          <ErrorBanner />
        </header>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <TeachPanel />
          <ConceptMap />
          <AssessmentPanel />
        </div>
      </div>
    </SessionProvider>
  );
}
