import "server-only";
import type { LearningRecord, MisconceptionEntry, Span } from "@/lib/contracts";
import { isRecursionRunsForeverResolved, RECURSION_RUNS_FOREVER } from "@/lib/content/recursion/misconceptions";
import { turnNumber } from "@/lib/evaluator/provenance";
import type { VerifiedMisconceptionReport } from "@/lib/evaluator/validate";
import { studentMisconceptionKey } from "./misconception-ids";

export interface MisconceptionEvent {
  misconception_id: string;
  origin: "seeded" | "student";
  event: "activated" | "resolved" | "reactivated";
  evidence: Span[];
  changed_in_version: number;
}

const latestTurn = (spans: Span[]) => Math.max(-1, ...spans.map((s) => turnNumber(s.turn_id)));

/** Returns event payloads for Phase 3 to persist atomically alongside the new snapshot. */
export function updateMisconceptions(
  previous: LearningRecord["misconceptions"],
  concepts: LearningRecord["concepts"],
  reports: readonly VerifiedMisconceptionReport[],
  version: number,
): { misconceptions: LearningRecord["misconceptions"]; events: MisconceptionEvent[] } {
  const misconceptions = structuredClone(previous);
  const events: MisconceptionEvent[] = [];
  function apply(key: string, id: string, origin: MisconceptionEntry["origin"], status: MisconceptionEntry["status"], evidence: Span[]) {
    const before = misconceptions[key];
    const changed = !before || before.status !== status;
    misconceptions[key] = {
      origin, status, evidence: structuredClone(evidence),
      changed_in_version: changed ? version : before.changed_in_version,
    };
    if (changed) events.push({
      misconception_id: id, origin,
      event: status === "resolved" ? "resolved" : before ? "reactivated" : "activated",
      evidence: structuredClone(evidence), changed_in_version: version,
    });
  }

  const seededId = RECURSION_RUNS_FOREVER.id;
  const resolved = isRecursionRunsForeverResolved({
    base_case: concepts.base_case.state,
    progress_toward_base_case: concepts.progress_toward_base_case.state,
  });
  // Seeded beliefs never carry student-attributed evidence, even when the same belief was asserted.
  apply(seededId, seededId, "seeded", resolved ? "resolved" : "active", []);

  // Numeric turn order, with assertions winning ties: a retraction must be later, not simultaneous.
  const chronological = reports.filter((report) => report.stance !== "retracted"
    || !reports.some((other) => other.id === report.id && other.stance === "asserted"
      && latestTurn(other.evidence) === latestTurn(report.evidence)))
    .sort((a, b) => latestTurn(a.evidence) - latestTurn(b.evidence)
    || (a.stance === b.stance ? 0 : a.stance === "retracted" ? -1 : 1));
  for (const report of chronological) {
    if (report.id !== seededId) throw new Error("Unknown misconception id");
    if (!report.evidence.length) continue;
    const key = studentMisconceptionKey(report.id);
    const before = misconceptions[key];
    const turn = latestTurn(report.evidence);
    const priorTurn = before ? latestTurn(before.evidence) : -1;
    if (turn < priorTurn) continue;
    if (report.stance === "retracted") {
      if (!before || turn <= priorTurn) continue;
      apply(key, report.id, "student", "resolved", report.evidence);
    } else {
      if (before && before.status === "active" && turn <= priorTurn) continue;
      apply(key, report.id, "student", "active", report.evidence);
    }
  }
  return { misconceptions, events };
}
