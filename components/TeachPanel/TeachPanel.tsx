"use client";

import { useState, type ReactNode } from "react";
import { useSession } from "@/hooks/useSession";
import type { Span } from "@/lib/contracts";

const EVAL_LABEL: Record<string, string> = {
  pending: "Evaluating…",
  evaluated: "Evaluated",
  failed: "Evaluation failed",
  not_applicable: "",
};

function highlight(content: string, spans: Span[]): ReactNode {
  const s = spans[0];
  if (!s || s.start < 0 || s.end > content.length || s.start >= s.end) return content;
  return (
    <>
      {content.slice(0, s.start)}
      <mark className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-700/60">{content.slice(s.start, s.end)}</mark>
      {content.slice(s.end)}
    </>
  );
}

export function TeachPanel() {
  const { state, actions } = useSession();
  const [text, setText] = useState("");
  const sel = state.selectedConceptId;
  const anyPending = !!state.pending.teach || state.messages.some((m) => m.role === "student" && m.evalStatus === "pending");
  const canSend = !anyPending && text.trim().length > 0 && state.phase === "teaching";

  const spansForTurn = (turnNo: number): Span[] =>
    sel ? state.record.concepts[sel].evidence.filter((sp) => sp.turn_id === `t${turnNo}`) : [];

  return (
    <section aria-label="Teach panel" className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Teach</h2>
      <ol className="flex flex-1 flex-col gap-2 overflow-auto">
        {state.messages.length === 0 && <li className="text-sm text-zinc-500">Start teaching your learner about recursion.</li>}
        {state.messages.map((m) => {
          const spans = spansForTurn(m.turnNo);
          return (
            <li key={m.id} className={m.role === "student" ? "rounded-md bg-zinc-100 p-2 text-sm dark:bg-zinc-800" : "rounded-md border border-black/10 p-2 text-sm italic dark:border-white/15"}>
              <span className="mr-2 font-medium">{m.role === "student" ? "You" : "Learner"}</span>
              {EVAL_LABEL[m.evalStatus] && <span className={`mr-2 text-xs ${m.evalStatus === "failed" ? "text-red-600" : "text-zinc-500"}`}>[{EVAL_LABEL[m.evalStatus]}]</span>}
              {highlight(m.content, spans)}
              {m.role === "student" && m.evalStatus === "failed" && (
                <button type="button" onClick={() => void actions.retry(m.id)} className="ml-2 rounded-full border border-red-300 px-2 py-0.5 text-xs text-red-700 dark:border-red-800 dark:text-red-400">
                  Retry
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <form
        aria-label="Teach input"
        onSubmit={(e) => { e.preventDefault(); if (!canSend) return; const t = text; setText(""); void actions.teach(t); }}
      >
        <textarea
          className="w-full rounded-md border border-black/10 p-2 text-sm disabled:opacity-50 dark:border-white/15 dark:bg-zinc-900"
          rows={2}
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          placeholder="Explain recursion in your own words…"
          disabled={anyPending || state.phase !== "teaching"}
        />
        <button type="submit" disabled={!canSend} className="mt-1 rounded-full bg-zinc-900 px-4 py-1 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900">
          {anyPending ? "Evaluating…" : "Send"}
        </button>
      </form>
    </section>
  );
}

export default TeachPanel;
