"use client";

import { useSession, CONCEPT_ORDER } from "@/hooks/useSession";
import type { ConceptId, ConceptState } from "@/lib/contracts";

const STATE_UI: Record<ConceptState, { label: string; icon: string }> = {
  not_taught: { label: "Not taught", icon: "○" },
  partially_taught: { label: "Partial", icon: "◐" },
  demonstrated: { label: "Solid", icon: "●" },
};

const CONCEPT_LABEL: Record<string, string> = {
  recursive_call: "Calls itself",
  smaller_subproblem: "Smaller subproblem",
  base_case: "Base case",
  progress_toward_base_case: "Progress to base case",
  return_path: "Return path",
};

export function ConceptMap() {
  const { state, actions } = useSession();
  const { record, selectedConceptId, selectedQuestionId } = state;

  // When a question is selected, only its blocking concepts are highlighted.
  const activeAttempt = state.attempts.find((a) => a.id === state.activeAttemptId);
  const selectedResult = activeAttempt?.results.find((r) => r.questionId === selectedQuestionId);
  const blocking = new Set<string>(selectedResult?.blocking.concepts ?? []);

  return (
    <section aria-label="Concept map" className="panel-card concept-panel">
      <div className="panel-heading"><span>2</span><div><h2>Teaching record</h2><p>Verified concepts · record v{record.version}</p></div></div>
      <ul className="concept-list">
        {CONCEPT_ORDER.map((id: ConceptId) => {
          const c = record.concepts[id];
          const ui = STATE_UI[c.state];
          const selected = selectedConceptId === id;
          const pulsed = blocking.has(id);
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => actions.selectConcept(selected ? undefined : id)}
                className={`concept-button ${
                  selected ? "concept-selected" : pulsed ? "concept-blocking" : ""
                }`}
              >
                <span>
                  <span aria-hidden className="mr-2">{ui.icon}</span>
                  {CONCEPT_LABEL[id] ?? id}
                  {c.uncertain && <span className="ml-1 text-xs text-amber-600">(uncertain)</span>}
                </span>
                <span className={`concept-state state-${c.state}`}>{ui.label}</span>
              </button>
              {selected && c.reason && <p className="px-2 pb-1 text-xs text-zinc-500">{c.reason}</p>}
            </li>
          );
        })}
      </ul>
      {Object.keys(record.misconceptions).length > 0 && (
        <div className="beliefs">
          <h3>Beliefs</h3>
          <ul className="flex flex-col gap-1">
            {Object.entries(record.misconceptions).map(([id, m]) => (
              <li key={id} className="text-xs">
                <span aria-hidden className="mr-1">{m.status === "active" ? "▲" : "✓"}</span>
                {id} — {m.origin === "seeded" ? "the learner's starting belief" : "from your explanation"}, {m.status}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default ConceptMap;
