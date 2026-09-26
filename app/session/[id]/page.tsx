"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { SessionProvider, useSession } from "@/hooks/useSession";
import { TeachPanel } from "@/components/TeachPanel";
import { ConceptMap } from "@/components/ConceptMap";
import { AssessmentPanel } from "@/components/AssessmentPanel";

/**
 * Single session page rendering all three panels at once (ARCHITECTURE_REVISED
 * §6). In development it hydrates from a mock; the import lives behind a
 * NODE_ENV guard so it is stripped from production bundles (verified by
 * scripts/check-bundle.ts). Phase 3 replaces this with GET /api/sessions/[id].
 */
function DevMockLoader() {
  const { state, dispatch } = useSession();
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      import("@/fixtures/dev/mockSession")
        .then(({ buildMockSession }) =>
          dispatch({ type: "HYDRATED", payload: buildMockSession(state.sessionId) }),
        )
        .catch(() => {});
    }
  }, [dispatch, state.sessionId]);
  return null;
}

export default function SessionPage() {
  const params = useParams<{ id: string }>();
  const sessionId = typeof params.id === "string" ? params.id : "demo";

  return (
    <SessionProvider sessionId={sessionId}>
      <DevMockLoader />
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
        <header>
          <h1 className="text-lg font-semibold">The Inverse Tutor</h1>
          <p className="text-sm text-zinc-500">
            Session {sessionId} · teach → assess → review
          </p>
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
