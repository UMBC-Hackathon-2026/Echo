import { useSession } from "@/hooks/useSession";
import type { Outcome, ConceptId } from "@/lib/contracts";
import Link from "next/link";

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
  const canAssess = (state.phase === "teaching" || state.phase === "reteaching") && !turnBlocked && !state.pending.attempt && !state.pending.teach;

  return (
    <section aria-label="Assessment panel" className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Assessment</h2>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Assessment</h2>

      {state.phase === "comparing" && state.comparison && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-zinc-500">
            Forms designed to be comparable, pending learner testing. The score reflects the explanation, not the student&apos;s own mastery.
          </p>
          <ul className="flex flex-col gap-3">
            {state.comparison.map((c) => (
              <li key={c.pairId} className="rounded-md border p-3 text-sm border-black/10 dark:border-white/15">
                <h3 className="font-semibold">{c.pairId} - {c.type}</h3>
                <div className="mt-1 flex flex-row gap-4">
                  <div className="flex-1">
                    <span className="text-xs text-zinc-500">Before</span>
                    <p>{c.before.outcome} ({c.before.points} of {c.before.maxPoints})</p>
                  </div>
                  <div className="flex-1">
                    <span className="text-xs text-zinc-500">After</span>
                    <p>{c.after.outcome} ({c.after.points} of {c.after.maxPoints})</p>
                  </div>
                </div>
                <div className="mt-2 text-xs font-medium">
                  {c.type}: {c.before.points} of {c.before.maxPoints} -&gt; {c.after.points} of {c.after.maxPoints}
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/"
            className="self-start rounded-full bg-zinc-900 px-4 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Start a new session
          </Link>
        </div>
      )}

      {state.phase !== "comparing" && (!active || active.status === "complete") && (
        <button
          type="button"
          onClick={() => void actions.assess()}
          disabled={!canAssess}
          className="self-start rounded-full bg-zinc-900 px-4 py-1 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {state.pending.attempt ? "Assessing…" : "Assess my learner"}
        </button>
      )}
      {state.phase !== "comparing" && (!active || active.status === "complete") && turnBlocked && <p className="text-xs text-amber-600">Resolve the pending or failed explanation first.</p>}

      {state.phase !== "comparing" && active && (
        <ul className="flex flex-col gap-3">
          {revealed.map((r) => {
            const o = OUTCOME_UI[r.outcome];
            const selected = state.selectedQuestionId === r.questionId;
            let isPulsed = false;
            if (state.selectedConceptId && r.review) {
              isPulsed = r.review.criteria.some((c) => c.requires.includes(state.selectedConceptId as ConceptId));
            }
            return (
              <li key={r.questionId} className={`rounded-md border p-3 text-sm ${selected ? "border-zinc-400 bg-zinc-50 dark:bg-zinc-800" : "border-black/10 dark:border-white/15"}`}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => actions.selectQuestion(selected ? undefined : r.questionId)}
                  className={`flex w-full items-center justify-between text-left font-medium p-2 -mx-2 rounded-md transition-colors ${
                    selected ? "bg-zinc-200 dark:bg-zinc-800" : isPulsed ? "outline outline-2 outline-amber-500 bg-amber-50 dark:bg-amber-900/20" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span>{r.question.prompt}</span>
                  <span className="ml-2 whitespace-nowrap text-xs text-zinc-500"><span aria-hidden className="mr-1">{o.icon}</span>{o.label} · {r.points}/{r.maxPoints}</span>
                </button>
                {r.question.code && (
                  <pre className="mt-2 rounded-md bg-zinc-100 p-2 text-xs dark:bg-zinc-900 overflow-x-auto">
                    <code>{r.question.code}</code>
                  </pre>
                )}
                <p className="mt-2 italic text-zinc-700 dark:text-zinc-300">“{r.answerText}”</p>
                {r.nextStep ? (
                  <div className="mt-2 flex flex-col items-start gap-2">
                    <p className="text-xs text-amber-700 dark:text-amber-400">Next step: {r.nextStep}</p>
                    <button
                      type="button"
                      onClick={() => {
                        if (actions.beginReteach) {
                          actions.beginReteach(r.questionId, r.nextStep!);
                        }
                        setTimeout(() => document.getElementById("teach-input")?.focus(), 0);
                      }}
                      className="rounded bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 outline outline-1 outline-amber-300 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-100"
                    >
                      Reteach this
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-green-700 dark:text-green-400">Met every criterion</p>
                )}

                {(r.blocking.concepts.length > 0 || r.blocking.misconceptions.length > 0) && (
                  <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="font-semibold">Blocking:</span>
                    <ul className="mt-1 list-disc pl-4">
                      {r.blocking.concepts.map((cid) => {
                        const concept = active.pinnedRecord.concepts[cid];
                        const quotes = concept?.evidence.length
                          ? concept.evidence.map((e) => `"${e.quote}"`).join(" ... ")
                          : "Not in your explanation yet";
                        return (
                          <li key={cid}>
                            <span className="font-medium">{cid}</span>: {quotes}
                          </li>
                        );
                      })}
                      {r.blocking.misconceptions.map((mid) => {
                        const misc = active.pinnedRecord.misconceptions[mid];
                        if (!misc) return <li key={mid}>{mid}</li>;
                        if (misc.origin === "seeded") {
                          return (
                            <li key={mid}>
                              <span className="font-medium">{mid}</span>: The learner&apos;s starting belief
                            </li>
                          );
                        }
                        const quotes = misc.evidence.length
                          ? misc.evidence.map((e) => `"${e.quote}"`).join(" ... ")
                          : "";
                        return (
                          <li key={mid}>
                            <span className="font-medium">{mid}</span>: Something your explanation said — {quotes}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

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
