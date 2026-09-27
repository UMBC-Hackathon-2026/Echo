import type { TopicRubric } from "@/lib/contracts/topic";
import "server-only";
import type { LearningRecord, MisconceptionEntry, Span } from "@/lib/contracts";
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
  topicRubricData: TopicRubric,
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

  // Numeric turn order, with assertions winning ties: a retraction must be later, not simultaneous.
  const chronological = reports.filter((report) => report.stance !== "retracted"
    || !reports.some((other) => other.id === report.id && other.stance === "asserted"
      && latestTurn(other.evidence) === latestTurn(report.evidence)))
    .sort((a, b) => latestTurn(a.evidence) - latestTurn(b.evidence)
    || (a.stance === b.stance ? 0 : a.stance === "retracted" ? -1 : 1));

  // Seeded beliefs: active by default, resolved if resolution concepts are demonstrated or evaluator retracted.
  for (const m of topicRubricData?.misconceptions || []) {
    const mReports = chronological.filter(r => r.id === m.id);
    const lastReport = mReports[mReports.length - 1];
    let resolved = lastReport && lastReport.stance === "retracted";
    if (!resolved) {
      const resolutionConcepts: string[] = m.resolutionConcepts || (m.id === "recursion_runs_forever" ? ["base_case", "progress_toward_base_case"] : []);
      if (resolutionConcepts.length > 0) {
        const [primary, ...rest] = resolutionConcepts;
        const primaryDemonstrated = concepts[primary]?.state === "demonstrated";
        if (primaryDemonstrated && (rest.length === 0 || rest.every((cid) => {
          const s = concepts[cid]?.state;
          return s === "partially_taught" || s === "demonstrated";
        }))) {
          resolved = true;
        }
      }
    }
    apply(m.id, m.id, "seeded", resolved ? "resolved" : "active", []);
  }


  for (const report of chronological) {
    if (!topicRubricData?.misconceptions?.some((m) => m.id === report.id)) throw new Error("Unknown misconception id");
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
