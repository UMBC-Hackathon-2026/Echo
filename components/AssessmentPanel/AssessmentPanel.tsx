import { useSession } from "@/hooks/useSession";
import { identifierLabel, questionTypeLabel, rubricItemLabel } from "@/lib/client/presentation";
import type { Outcome, ConceptState } from "@/lib/contracts";
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

export function AssessmentPanel() {
  const { state, actions } = useSession();
  const active = state.attempts.find((a) => a.id === state.activeAttemptId);
  const revealed = active ? active.results.slice(0, state.revealIndex) : [];
  const conceptNames = new Map(
    state.topic.rubricData.concepts.map((concept) => [concept.id, rubricItemLabel(concept)]),
  );
  const misconceptionNames = new Map(
    state.topic.rubricData.misconceptions.map((misconception) => [misconception.id, rubricItemLabel(misconception)]),
  );

  const turnBlocked = state.messages.some((m) => m.role === "student" && (m.evalStatus === "pending" || m.evalStatus === "failed"));
  const canAssess = (state.phase === "teaching" || state.phase === "reteaching") && !turnBlocked && !state.pending.attempt && !state.pending.teach;

  return (
    <section aria-label="Assessment panel" className="panel-card assessment-panel">
      <div className="panel-heading"><span>3</span><div><h2>Assess &amp; review</h2><p>Answers come from the teaching record.</p></div></div>

      {state.phase === "comparing" && state.comparison && (() => {
        const concepts = state.comparison[0];
        if (!concepts) {
          return <p className="comparison-note">No comparison results are available for this session.</p>;
        }
        const afterAttempt = state.attempts.find((a) => a.attemptNo === 2);
        const seededBeliefs = Object.values(afterAttempt?.pinnedRecord.misconceptions ?? {})
          .filter((misconception) => misconception.origin === "seeded");
        const beliefsResolved = seededBeliefs.every((misconception) => misconception.status === "resolved");
        return (
          <div className="comparison-drawer" role="region" aria-label="Before and after comparison">
            <header className="comparison-heading">
              <div><p className="eyebrow">Comparison ready</p><h3>Before &amp; after reteaching</h3></div>
              <span>{state.comparison.length} {state.comparison.length === 1 ? "question" : "questions"}</span>
            </header>
            <p className="comparison-note">
              Forms designed to be comparable, pending learner testing. The score reflects the explanation, not the student&apos;s own mastery.
            </p>
            <ul className="flex flex-col gap-3">
              {state.comparison.map((c) => {
                const improved = c.after.points > c.before.points;
                const typeLabel = questionTypeLabel(c.type);
                return (
                  <li
                    key={c.pairId}
                    data-testid={`compare-${c.pairId}`}
                    data-before-points={c.before.points}
                    data-after-points={c.after.points}
                    data-improved={improved}
                    className="rounded-md border p-3 text-sm border-black/10 dark:border-white/15"
                  >
                    <h3 className="font-semibold">{c.pairId} — {typeLabel}</h3>
                    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:gap-4">
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
                      {typeLabel}: {c.before.points} of {c.before.maxPoints} → {c.after.points} of {c.after.maxPoints} {improved ? "(improved)" : "(no change)"}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div data-testid="concept-changes" className="rounded-md border border-black/10 p-3 text-sm dark:border-white/15">
              <h3 className="font-semibold">What your learner understands now</h3>
              <ul className="mt-1 flex flex-col gap-1">
                {state.topic.rubricData.concepts.map((concept) => {
                  const cid = concept.id;
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
                      <span>{rubricItemLabel(concept)}</span>
                      <span className="whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400">
                        {STATE_LABEL[before] ?? "Not available"} → {STATE_LABEL[after] ?? "Not available"}{changed ? " (changed)" : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {seededBeliefs.length > 0 && (
                <p data-testid="belief-status" data-resolved={beliefsResolved} className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                  Starting {seededBeliefs.length === 1 ? "belief" : "beliefs"}: {beliefsResolved ? "resolved" : "still active"}
                </p>
              )}
            </div>

            <Link
              href="/"
              className="primary-button self-start"
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
          className="primary-button self-start"
        >
          {state.pending.attempt && <span aria-hidden className="button-spinner" />}{state.pending.attempt ? "Assessing…" : "Assess my learner"}
        </button>
      )}
      {state.phase !== "comparing" && (!active || active.status === "complete") && turnBlocked && <p className="text-xs text-amber-600">Resolve the pending or failed explanation first.</p>}

      {state.phase !== "comparing" && active && (
        <ul className="flex flex-col gap-3">
          {revealed.map((r) => {
            const o = OUTCOME_UI[r.outcome];
            const selected = state.selectedQuestionId === r.questionId;
            const selectedConceptId = state.selectedConceptId;
            const review = active.status === "complete" ? r.review : undefined;
            let isPulsed = false;
            if (selectedConceptId && review) {
              isPulsed = review.criteria.some((c) => c.requires.includes(selectedConceptId));
            }
            return (
              <li key={r.questionId} className={`answer-card answer-reveal ${selected ? "answer-selected" : ""}`}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => actions.selectQuestion(selected ? undefined : r.questionId)}
                  className={`answer-heading ${
                    selected ? "answer-heading-selected" : isPulsed ? "answer-heading-pulsed" : ""
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
                {state.voice.enabled && (
                  <div className="mt-2 flex gap-3">
                    <button type="button" onClick={() => void actions.playVoice("question_result", r.id)} className="text-xs text-blue-600 underline dark:text-blue-400">Replay</button>
                    {state.voice.speaking && <button type="button" onClick={() => actions.stopVoice()} className="text-xs text-red-600 underline dark:text-red-400">Stop</button>}
                  </div>
                )}
                {r.nextStep ? (
                  <div className="mt-2 flex flex-col items-start gap-2">
                    <p className="text-xs text-amber-700 dark:text-amber-400">Next step: {r.nextStep}</p>
                    <button
                      type="button"
                      onClick={async () => {
                        if (actions.beginReteach) {
                          await actions.beginReteach(r.questionId, r.nextStep!);
                        }
                        requestAnimationFrame(() => document.getElementById("teach-input")?.focus());
                      }}
                      className="reteach-button"
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
                            <span className="font-medium">{conceptNames.get(cid) ?? identifierLabel(cid)}</span>: {quotes}
                          </li>
                        );
                      })}
                      {r.blocking.misconceptions.map((mid) => {
                        const misc = active.pinnedRecord.misconceptions[mid];
                        const label = misconceptionNames.get(mid) ?? identifierLabel(mid);
                        if (!misc) return <li key={mid}>{label}</li>;
                        if (misc.origin === "seeded") {
                          return (
                            <li key={mid}>
                              <span className="font-medium">{label}</span>: The learner&apos;s starting belief
                            </li>
                          );
                        }
                        const quotes = misc.evidence.length
                          ? misc.evidence.map((e) => `"${e.quote}"`).join(" ... ")
                          : "";
                        return (
                          <li key={mid}>
                            <span className="font-medium">{label}</span>: Something your explanation said — {quotes}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {review && (
                  <details className="review-card">
                    <summary className="cursor-pointer">Answer key &amp; criteria</summary>
                    <p className="review-answer">{review.answerKey}</p>
                    {review.guidance && review.guidance.length > 0 && <p className="review-label">Guidance</p>}
                    <ul className="review-list">
                      {review.guidance?.map((text, index) => <li key={`guidance-${index}`}>{text}</li>)}
                    </ul>
                    <p className="review-label">Criteria</p>
                    <ul className="review-list">
                      {review.criteria.map((c) => (
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
              <button type="button" onClick={() => actions.revealNext()} className="secondary-button">Reveal next answer</button>
            </li>
          )}
          {active.status === "in_progress" && active.results.length === state.revealIndex && (
            <li>
              <button
                type="button"
                onClick={() => void actions.complete(active.id)}
                disabled={!!state.pending.complete}
                className="primary-button"
              >
                {state.pending.complete && <span aria-hidden className="button-spinner" />}{state.pending.complete ? "Completing…" : "Complete attempt"}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

export default AssessmentPanel;
