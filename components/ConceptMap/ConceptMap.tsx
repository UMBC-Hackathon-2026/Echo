import type { ReactNode } from "react";

/** Mastery status for a single concept/sub-concept node. */
export type ConceptStatus = "unknown" | "shaky" | "solid";

export interface ConceptNode {
  id: string;
  label: string;
  status: ConceptStatus;
  /** ids of prerequisite concepts this node depends on. */
  dependsOn?: string[];
}

export interface ConceptMapProps {
  /** Nodes to render, typically derived from concept_states. */
  nodes: ConceptNode[];
  /** id of the node currently in focus. */
  activeNodeId?: string;
  /** Fired when a node is selected. */
  onSelectNode?: (id: string) => void;
  children?: ReactNode;
}

/**
 * ConceptMap — visualizes the learner's evolving understanding as a graph of
 * concepts and prerequisites. Presentational stub, no layout/logic yet.
 */
export function ConceptMap(_props: ConceptMapProps) {
  return (
    <section aria-label="Concept map" data-component="ConceptMap">
      {/* TODO: render concept graph */}
    </section>
  );
}

export default ConceptMap;
