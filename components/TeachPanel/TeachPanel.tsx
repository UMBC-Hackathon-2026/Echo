import type { ReactNode } from "react";

export interface TeachPanelProps {
  /** The concept the learner is being asked to teach (e.g. "recursion"). */
  concept: string;
  /** Current explanation draft written by the learner. */
  explanation?: string;
  /** Fired as the learner edits their explanation. */
  onExplanationChange?: (value: string) => void;
  /** Fired when the learner submits their explanation to the restricted learner. */
  onSubmit?: () => void;
  /** Whether an evaluation/learner round-trip is in flight. */
  isSubmitting?: boolean;
  children?: ReactNode;
}

/**
 * TeachPanel — where the human explains a concept well enough that the
 * restricted AI "learner" can use it. Presentational stub, no logic yet.
 */
export function TeachPanel(_props: TeachPanelProps) {
  return (
    <section aria-label="Teach panel" data-component="TeachPanel">
      {/* TODO: explanation editor + submit control */}
    </section>
  );
}

export default TeachPanel;
