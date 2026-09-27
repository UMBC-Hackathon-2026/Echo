export const MAX_FILES = 20;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const EXTRACTION_FAILURE = "We couldn't prepare your lesson because the document service failed. Please try again later.";
export const UNREADABLE_PDFS = "We couldn't read any text from your PDFs. Please upload clearer scans or PDFs with readable text.";
export const CONTENT_FAILURE = "We read your PDFs but couldn't identify a clear enough set of concepts for this topic. Please add relevant study material.";

export function pdfProblem(file: Pick<File, "name" | "type" | "size">): string | null {
  if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) return "Only PDF files are allowed.";
  if (!file.size || file.size > MAX_FILE_SIZE_BYTES) return "Each PDF must be nonempty and no larger than 10MB.";
  return null;
}
