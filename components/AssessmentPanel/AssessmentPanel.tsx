import { useSession, CONCEPT_ORDER } from "@/hooks/useSession";
import type { Outcome, ConceptId, ConceptState } from "@/lib/contracts";
import Link from "next/link";

const OUTCOME_UI: Record<Outcome, { label: string; icon: string }> = {
  correct: { label: "Correct", icon: "✓" },
  partial: { label: "Partial", icon: "◐" },
  misconception: { label: "Misconception", icon: "▲" },
  unsure: { label: "Unsure", icon: "?" },
};

const STATE_LABEL: Record<ConceptState, string> = {
  not_taught: "Not taught",
  partially_taught: "Partial",
  demonstrated: "Solid",
};

const CONCEPT_LABEL: Record<string, string> = {
  recursive_call: "Calls itself",
  smaller_subproblem: "Smaller subproblem",
  base_case: "Base case",
  progress_toward_base_case: "Progress to base case",
  return_path: "Return path",
};

const SEEDED_BELIEF_ID = "recursion_runs_forever";

export function AssessmentPanel() {
  const { state, actions } = useSession();
  const active = state.attempts.find((a) => a.id === state.activeAttemptId);
  const revealed = active ? active.results.slice(0, state.revealIndex) : [];

  const turnBlocked = state.messages.some((m) => m.role === "student" && (m.evalStatus === "pending" || m.evalStatus === "failed"));
  const canAssess = (state.phase === "teaching" || state.phase === "reteaching") && !turnBlocked && !state.pending.attempt && !state.pending.teach;

  return (
    <section aria-label="Assessment panel" className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Assessment</h2>

      {state.phase === "comparing" && state.comparison && (() => {
        const concepts = state.comparison[0];
        const afterAttempt = state.attempts.find((a) => a.attemptNo === 2);
        const beliefResolved = afterAttempt?.pinnedRecord.misconceptions[SEEDED_BELIEF_ID]?.status === "resolved";
        return (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-zinc-500">
              Forms designed to be comparable, pending learner testing. The score reflects the explanation, not the student&apos;s own mastery.
            </p>
            <ul className="flex flex-col gap-3">
              {state.comparison.map((c) => {
                const improved = c.after.points > c.before.points;
                return (
                  <li
                    key={c.pairId}
                    data-testid={`compare-${c.pairId}`}
                    data-before-points={c.before.points}
                    data-after-points={c.after.points}
                    data-improved={improved}
                    className="rounded-md border p-3 text-sm border-black/10 dark:border-white/15"
                  >
                    <h3 className="font-semibold">{c.pairId} — {c.type}</h3>
                    <div className="mt-1 flex flex-row gap-4">
                      <div className="flex-1">
                        <span className="text-xs text-zinc-500">Before</span>
                        <p>{OUTCOME_UI[c.before.outcome].label} ({c.before.points} of {c.before.maxPoints})</p>
                        <p data-testid={`compare-${c.pairId}-before-answer`} className="mt-1 italic text-zinc-600 dark:text-zinc-400">{c.before.answerText}</p>
                      </div>
                      <div className="flex-1">
                        <span className="text-xs text-zinc-500">After</span>
                        <p>{OUTCOME_UI[c.after.outcome].label} ({c.after.points} of {c.after.maxPoints})</p>
                        <p data-testid={`compare-${c.pairId}-after-answer`} className="mt-1 italic text-zinc-600 dark:text-zinc-400">{c.after.answerText}</p>
                      </div>
                    </div>
                    <div className="mt-2 text-xs font-medium">
                      {c.type}: {c.before.points} of {c.before.maxPoints} → {c.after.points} of {c.after.maxPoints} {improved ? "(improved)" : "(no change)"}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div data-testid="concept-changes" className="rounded-md border border-black/10 p-3 text-sm dark:border-white/15">
              <h3 className="font-semibold">What your learner understands now</h3>
              <ul className="mt-1 flex flex-col gap-1">
                {CONCEPT_ORDER.map((cid) => {
                  const before = concepts.conceptsBefore[cid];
                  const after = concepts.conceptsAfter[cid];
                  const changed = before !== after;
                  return (
                    <li
                      key={cid}
                      data-testid={`concept-change-${cid}`}
                      data-before={before}
                      data-after={after}
                      data-changed={changed}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>{CONCEPT_LABEL[cid] ?? cid}</span>
                      <span className="whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400">
                        {STATE_LABEL[before]} → {STATE_LABEL[after]}{changed ? " (changed)" : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p data-testid="belief-status" data-resolved={beliefResolved} className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                Starting belief: {beliefResolved ? "resolved" : "still active"}
              </p>
            </div>

            <Link
              href="/"
              className="self-start rounded-full bg-zinc-900 px-4 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Start a new session
            </Link>
          </div>
        );
      })()}

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
