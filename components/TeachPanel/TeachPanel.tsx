"use client";

import { useState, type ReactNode } from "react";
import { useSession } from "@/hooks/useSession";
import type { Span } from "@/lib/contracts";

const DEMO_HELPER = process.env.NEXT_PUBLIC_DEMO_HELPER === "true";
const DEMO_TEXT = {
  teaching: "A function is recursive when it calls itself, and each call works on a smaller n.",
  reteaching: "It stops when n reaches 0: at n === 0 it returns without calling itself again.",
} as const;

const EVAL_LABEL: Record<string, string> = {
  pending: "Evaluating…",
  evaluated: "Evaluated",
  failed: "Evaluation failed",
  not_applicable: "",
};

function highlight(content: string, spans: Span[]): ReactNode {
  const valid = spans
    .filter((s) => s.start >= 0 && s.end <= content.length && s.start < s.end)
    .sort((a, b) => a.start - b.start);
  if (!valid.length) return content;
  const parts: ReactNode[] = [];
  let cursor = 0;
  valid.forEach((s, i) => {
    if (s.start < cursor) return; // skip an overlapping span
    if (s.start > cursor) parts.push(content.slice(cursor, s.start));
    parts.push(
      <mark key={i} className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-700/60">{content.slice(s.start, s.end)}</mark>,
    );
    cursor = s.end;
  });
  if (cursor < content.length) parts.push(content.slice(cursor));
  return <>{parts}</>;
}

export function TeachPanel() {
  const { state, actions } = useSession();
  const [text, setText] = useState("");
  const { record, selectedConceptId, selectedQuestionId, attempts, activeAttemptId } = state;
  const topicName = state.topic.name.trim() || "this topic";
  const isRecursionDemo = ["recursive_call", "base_case"].every((id) =>
    state.topic.rubricData.concepts.some((concept) => concept.id === id),
  );
  const anyPending = !!state.pending.teach || state.messages.some((m) => m.role === "student" && m.evalStatus === "pending");
  const canSend = !anyPending && text.trim().length > 0 && (state.phase === "teaching" || state.phase === "reteaching");
  const demoText = state.phase === "reteaching" ? DEMO_TEXT.reteaching : DEMO_TEXT.teaching;

  const activeAttempt = attempts.find((a) => a.id === activeAttemptId);
  const selectedResult = activeAttempt?.results.find((r) => r.questionId === selectedQuestionId);
  const blockingConcepts = selectedResult?.blocking.concepts ?? [];
  const blockingMisconceptions = selectedResult?.blocking.misconceptions ?? [];

  const spansForTurn = (turnNo: number): Span[] => {
    const spans: Span[] = [];
    if (selectedConceptId) {
      spans.push(...(record.concepts[selectedConceptId]?.evidence ?? []).filter((sp) => sp.turn_id === `t${turnNo}`));
    }
    if (selectedQuestionId && activeAttempt) {
      const pinned = activeAttempt.pinnedRecord;
      if (pinned) {
        for (const cid of blockingConcepts) {
          spans.push(...(pinned.concepts[cid]?.evidence ?? []).filter((sp) => sp.turn_id === `t${turnNo}`));
        }
        for (const mid of blockingMisconceptions) {
          const m = pinned.misconceptions[mid];
          if (m) spans.push(...m.evidence.filter((sp) => sp.turn_id === `t${turnNo}`));
        }
      }
    }
    return spans;
  };

  return (
    <section aria-label="Teach panel" className="panel-card teach-panel">
      <div className="panel-heading"><span>1</span><div><h2>Teach</h2><p>Explain {topicName} in your own words.</p></div></div>
      <ol className="transcript" aria-label="Teaching conversation">
        {state.messages.length === 0 && <li className="text-sm text-zinc-500">Start teaching your learner about {topicName}.</li>}
        {state.messages.map((m) => {
          const spans = spansForTurn(m.turnNo);
          return (
            <li key={m.id} className={m.role === "student" ? "message message-student" : "message message-learner"}>
              <span className="mr-2 font-medium">{m.role === "student" ? "You" : "Learner"}</span>
              {EVAL_LABEL[m.evalStatus] && <span className={`status-chip ${m.evalStatus === "failed" ? "status-failed" : ""}`}>{EVAL_LABEL[m.evalStatus]}</span>}
              {highlight(m.content, spans)}
              {m.role === "student" && m.evalStatus === "failed" && (
                <button type="button" onClick={() => void actions.retry(m.id)} className="secondary-button ml-2">
                  Retry
                </button>
              )}
              {m.role === "learner" && state.voice.enabled && (
                <div className="mt-2 flex gap-3">
                  <button type="button" onClick={() => void actions.playVoice("learner_message", m.id)} className="text-xs text-blue-600 underline dark:text-blue-400">Replay</button>
                  {state.voice.speaking && <button type="button" onClick={() => actions.stopVoice()} className="text-xs text-red-600 underline dark:text-red-400">Stop</button>}
                </div>
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
          id="teach-input"
          className="teach-input"
          rows={2}
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Explain ${topicName} in your own words…`}
          disabled={anyPending || (state.phase !== "teaching" && state.phase !== "reteaching")}
        />
        <div className="teach-actions">
          <button type="submit" disabled={!canSend} className="primary-button">
            {anyPending ? "Evaluating…" : "Send explanation"}
          </button>
          {DEMO_HELPER && isRecursionDemo && (state.phase === "teaching" || state.phase === "reteaching") && (
            <button
              type="button"
              className="demo-helper"
              onClick={() => setText(demoText)}
            >
              <span aria-hidden>✦</span> Paste demo explanation
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

export default TeachPanel;
