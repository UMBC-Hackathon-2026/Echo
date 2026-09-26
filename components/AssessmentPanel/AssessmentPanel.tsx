"use client";

import { useSession } from "@/hooks/useSession";
import type { Outcome } from "@/lib/contracts";

const OUTCOME_UI: Record<Outcome, { label: string; icon: string }> = {
  correct: { label: "Correct", icon: "✓" },
  partial: { label: "Partial", icon: "◐" },
  misconception: { label: "Misconception", icon: "▲" },
  unsure: { label: "Unsure", icon: "?" },
};

export function AssessmentPanel() {
  const { state, actions } = useSession();
  const active = state.attempts.find((a) => a.id === state.activeAttemptId);
  const revealed = active ? active.results.slice(0, state.revealIndex) : [];

  const turnBlocked = state.messages.some((m) => m.role === "student" && (m.evalStatus === "pending" || m.evalStatus === "failed"));
  const canAssess = state.phase === "teaching" && !turnBlocked && !state.pending.attempt && !state.pending.teach;

  return (
    <section aria-label="Assessment panel" className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Assessment</h2>

      {!active && (
        <button
          type="button"
          onClick={() => void actions.assess()}
          disabled={!canAssess}
          className="self-start rounded-full bg-zinc-900 px-4 py-1 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {state.pending.attempt ? "Assessing…" : "Assess my learner"}
        </button>
      )}
      {!active && turnBlocked && <p className="text-xs text-amber-600">Resolve the pending or failed explanation first.</p>}

      {active && (
        <ul className="flex flex-col gap-3">
          {revealed.map((r) => {
            const o = OUTCOME_UI[r.outcome];
            const selected = state.selectedQuestionId === r.questionId;
            return (
              <li key={r.questionId} className={`rounded-md border p-3 text-sm ${selected ? "border-zinc-400 bg-zinc-50 dark:bg-zinc-800" : "border-black/10 dark:border-white/15"}`}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => actions.selectQuestion(selected ? undefined : r.questionId)}
                  className="flex w-full items-center justify-between text-left font-medium"
                >
                  <span>{r.question.prompt}</span>
                  <span className="ml-2 whitespace-nowrap text-xs text-zinc-500"><span aria-hidden className="mr-1">{o.icon}</span>{o.label} · {r.points}/{r.maxPoints}</span>
                </button>
                <p className="mt-2 italic text-zinc-700 dark:text-zinc-300">“{r.answerText}”</p>
                {r.nextStep && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Next step: {r.nextStep}</p>}
                {r.review && (
                  <details className="mt-2 text-xs text-zinc-500">
                    <summary className="cursor-pointer">Answer key &amp; criteria</summary>
                    <p className="mt-1">{r.review.answerKey}</p>
                    <ul className="mt-1 list-disc pl-4">
                      {r.review.criteria.map((c) => (
                        <li key={c.id}>{c.text} ({c.points} pt) — {r.earnedCriteria.includes(c.id) ? "earned" : "not earned"}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}

          {active.results.length > state.revealIndex && (
            <li>
              <button type="button" onClick={() => actions.revealNext()} className="rounded-full border border-black/10 px-3 py-1 text-xs dark:border-white/15">Reveal next answer</button>
            </li>
          )}
          {active.status === "in_progress" && active.results.length === state.revealIndex && (
            <li>
              <button
                type="button"
                onClick={() => void actions.complete(active.id)}
                disabled={!!state.pending.complete}
                className="rounded-full bg-zinc-900 px-4 py-1 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {state.pending.complete ? "Completing…" : "Complete attempt"}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

export default AssessmentPanel;
