"use client";

import { useSession } from "@/hooks/useSession";
import type { Outcome } from "@/lib/contracts";

const OUTCOME_UI: Record<Outcome, { label: string; icon: string }> = {
  correct: { label: "Correct", icon: "✓" },
  partial: { label: "Partial", icon: "◐" },
  misconception: { label: "Misconception", icon: "▲" },
  unsure: { label: "Unsure", icon: "?" },
};

/**
 * AssessmentPanel — how the restricted learner did, revealed one persisted
 * answer at a time (ARCHITECTURE_REVISED §6). Review fields (answer key,
 * criteria) appear only after the attempt is complete.
 */
export function AssessmentPanel() {
  const { state, dispatch } = useSession();
  const active = state.attempts.find((a) => a.id === state.activeAttemptId);
  const revealed = active ? active.results.slice(0, state.revealIndex) : [];

  return (
    <section aria-label="Assessment panel" className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Assessment</h2>
      {!active && <p className="text-sm text-zinc-500">No attempt yet. Teach your learner, then assess it.</p>}
      {active && (
        <ul className="flex flex-col gap-3">
          {revealed.map((r) => {
            const o = OUTCOME_UI[r.outcome];
            const selected = state.selectedQuestionId === r.questionId;
            return (
              <li
                key={r.questionId}
                className={`rounded-md border p-3 text-sm ${
                  selected ? "border-zinc-400 bg-zinc-50 dark:bg-zinc-800" : "border-black/10 dark:border-white/15"
                }`}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    dispatch({ type: "SELECT_QUESTION", payload: { questionId: selected ? undefined : r.questionId } })
                  }
                  className="flex w-full items-center justify-between text-left font-medium"
                >
                  <span>{r.question.prompt}</span>
                  <span className="ml-2 whitespace-nowrap text-xs text-zinc-500">
                    <span aria-hidden className="mr-1">{o.icon}</span>
                    {o.label} · {r.points}/{r.maxPoints}
                  </span>
                </button>
                <p className="mt-2 italic text-zinc-700 dark:text-zinc-300">“{r.answerText}”</p>
                {r.nextStep && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Next step: {r.nextStep}</p>
                )}
                {r.review && (
                  <details className="mt-2 text-xs text-zinc-500">
                    <summary className="cursor-pointer">Answer key &amp; criteria</summary>
                    <p className="mt-1">{r.review.answerKey}</p>
                    <ul className="mt-1 list-disc pl-4">
                      {r.review.criteria.map((c) => (
                        <li key={c.id}>
                          {c.text} ({c.points} pt) — {r.earnedCriteria.includes(c.id) ? "earned" : "not earned"}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
          {active.results.length > state.revealIndex && (
            <li>
              <button
                type="button"
                onClick={() => dispatch({ type: "REVEAL_NEXT" })}
                className="rounded-full border border-black/10 px-3 py-1 text-xs dark:border-white/15"
              >
                Reveal next answer
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

export default AssessmentPanel;
