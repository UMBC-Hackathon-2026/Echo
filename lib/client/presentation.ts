import type { ComparisonRowDTO, PublicQuestion } from "@/lib/contracts";

export function identifierLabel(id: string): string {
  const label = id.replace(/[_.-]+/g, " ").replace(/\s+/g, " ").trim();
  return label ? label.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unnamed item";
}

export function rubricItemLabel(item: { id: string; name?: string }): string {
  const name = item.name?.trim();
  return name || identifierLabel(item.id);
}

export function questionTypeLabel(type: PublicQuestion["type"] | ComparisonRowDTO["type"] | string): string {
  switch (type) {
    case "termination":
      return "Termination";
    case "trace":
      return "Trace";
    case "non-progress":
      return "Non-progress";
    case "transfer":
      return "Transfer";
    case "explain":
      return "Explain";
    case "modify":
      return "Modify";
    case "other":
      return "Other";
    default:
      return "Question";
  }
}
