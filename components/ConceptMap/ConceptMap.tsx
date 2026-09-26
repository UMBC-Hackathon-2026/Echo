"use client";

import { useSession, CONCEPT_ORDER } from "@/hooks/useSession";
import type { ConceptState } from "@/lib/contracts";

// Text label + icon (never color alone — §6 accessibility).
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

/**
 * ConceptMap — the learner's evolving understanding (ARCHITECTURE_REVISED §6).
 * Clicking a concept drives the cross-panel highlight (selectedConceptId).
 */
export function ConceptMap() {
  const { state, dispatch } = useSession();
  const { record, selectedConceptId } = state;

  return (
    <section aria-label="Concept map" className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Concept map <span className="ml-1 font-normal normal-case text-zinc-400">record v{record.version}</span>
      </h2>
      <ul className="flex flex-col gap-1">
        {CONCEPT_ORDER.map((id) => {
          const c = record.concepts[id];
          const ui = STATE_UI[c.state];
          const selected = selectedConceptId === id;
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  dispatch({ type: "SELECT_CONCEPT", payload: { conceptId: selected ? undefined : id } })
                }
                className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm ${
                  selected ? "bg-zinc-200 dark:bg-zinc-700" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <span>
                  <span aria-hidden className="mr-2">{ui.icon}</span>
                  {CONCEPT_LABEL[id] ?? id}
                  {c.uncertain && <span className="ml-1 text-xs text-amber-600">(uncertain)</span>}
                </span>
                <span className="text-xs text-zinc-500">{ui.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {Object.keys(record.misconceptions).length > 0 && (
        <div className="mt-1 border-t border-black/10 pt-2 dark:border-white/15">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Beliefs</h3>
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
