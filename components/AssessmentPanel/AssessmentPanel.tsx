import type { ReactNode } from "react";

export interface AssessmentQuestion {
  id: string;
  prompt: string;
}

export interface AssessmentResult {
  questionId: string;
  correct: boolean;
  /** Evaluator feedback tied to rubric criteria. */
  feedback?: string;
}

export interface AssessmentPanelProps {
  /** Questions posed to the restricted learner (from the question bank). */
  questions: AssessmentQuestion[];
  /** Per-question outcomes once graded. */
  results?: AssessmentResult[];
  /** Fired to start a new assessment attempt. */
  onStartAttempt?: () => void;
  children?: ReactNode;
}

/**
 * AssessmentPanel — shows how well the restricted learner performs on transfer
 * questions after being taught, i.e. did the teaching stick. Presentational
 * stub, no logic yet.
 */
export function AssessmentPanel(_props: AssessmentPanelProps) {
  return (
    <section aria-label="Assessment panel" data-component="AssessmentPanel">
      {/* TODO: render questions + results */}
    </section>
  );
}

export default AssessmentPanel;
