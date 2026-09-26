"use client";

import { useSession } from "@/hooks/useSession";

const EVAL_LABEL: Record<string, string> = {
  pending: "Evaluating…",
  evaluated: "Evaluated",
  failed: "Evaluation failed",
  not_applicable: "",
};

/**
 * TeachPanel — the teach transcript (ARCHITECTURE_REVISED §6). Phase 1 renders
 * the messages from the store; the submit path is wired in Phase 3.
 */
export function TeachPanel() {
  const { state } = useSession();
  return (
    <section aria-label="Teach panel" className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Teach</h2>
      <ol className="flex flex-1 flex-col gap-2">
        {state.messages.length === 0 && (
          <li className="text-sm text-zinc-500">No explanation yet. Start teaching your learner.</li>
        )}
        {state.messages.map((m) => (
          <li
            key={m.id}
            className={
              m.role === "student"
                ? "rounded-md bg-zinc-100 p-2 text-sm dark:bg-zinc-800"
                : "rounded-md border border-black/10 p-2 text-sm italic dark:border-white/15"
            }
          >
            <span className="mr-2 font-medium">{m.role === "student" ? "You" : "Learner"}</span>
            {EVAL_LABEL[m.evalStatus] && (
              <span className="mr-2 text-xs text-zinc-500">[{EVAL_LABEL[m.evalStatus]}]</span>
            )}
            {m.content}
          </li>
        ))}
      </ol>
      <form aria-label="Teach input" onSubmit={(e) => e.preventDefault()}>
        <textarea
          className="w-full rounded-md border border-black/10 p-2 text-sm dark:border-white/15 dark:bg-zinc-900"
          rows={2}
          placeholder="Explain recursion in your own words… (submit wired in Phase 3)"
          disabled
        />
      </form>
    </section>
  );
}

export default TeachPanel;
