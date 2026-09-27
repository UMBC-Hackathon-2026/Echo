import { CONTENT_FAILURE, UNREADABLE_PDFS } from "./upload-policy";

export class DocumentContentError extends Error {
  constructor(public readonly code: "unreadable_pdf" | "insufficient_material") {
    super(code === "unreadable_pdf" ? UNREADABLE_PDFS : CONTENT_FAILURE);
  }
}
