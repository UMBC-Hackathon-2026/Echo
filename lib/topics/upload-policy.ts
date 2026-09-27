export const MAX_FILES = 20;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const EXTRACTION_FAILURE = "We couldn't extract enough clear concepts from these documents. Please try adding more structured study guides.";

export function pdfProblem(file: Pick<File, "name" | "type" | "size">): string | null {
  if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) return "Only PDF files are allowed.";
  if (!file.size || file.size > MAX_FILE_SIZE_BYTES) return "Each PDF must be nonempty and no larger than 10MB.";
  return null;
}
