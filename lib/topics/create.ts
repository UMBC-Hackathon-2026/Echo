import "server-only";
import { DocumentContentError } from "./errors";
import { DynamicRubricSchema, type DynamicRubric } from "@/lib/contracts/dynamic-rubric";
import { EXTRACTION_FAILURE, MAX_FILES, MAX_FILE_SIZE_BYTES, pdfProblem } from "./upload-policy";

export interface TopicCreationDependencies {
  admit(client: string): number;
  create(name: string): Promise<string>;
  processing(id: string): Promise<void>;
  ready(id: string, rubric: DynamicRubric): Promise<void>;
  failed(id: string): Promise<void>;
  extract(name: string, files: File[]): Promise<unknown>;
}

const json = (body: object, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function createTopic(request: Request, deps: TopicCreationDependencies): Promise<Response> {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  const wait = deps.admit(client);
  if (wait) return json({ error: "Too many uploads. Please wait before trying again." }, 429, { "Retry-After": String(wait) });
  // Defense in depth; the deployment proxy must also enforce its body-size cap.
  if (Number(request.headers.get("content-length")) > MAX_FILES * MAX_FILE_SIZE_BYTES + 1024 * 1024) {
    return json({ error: "Upload is too large." }, 413);
  }
  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ error: "Please send a topic name and PDF files." }, 400); }
  const name = form.get("topicName");
  if (typeof name !== "string" || !name.trim() || name.trim().length > 200) {
    return json({ error: "Topic name must contain 1–200 characters." }, 400);
  }
  const entries = form.getAll("files");
  if (!entries.length || entries.length > MAX_FILES) return json({ error: "Please upload between 1 and 20 PDFs." }, 400);
  const files: File[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") return json({ error: "Only PDF files are allowed." }, 400);
    const problem = pdfProblem(entry);
    if (problem) return json({ error: problem }, 400);
    // MIME/extension alone are supplied by the client; require a PDF signature too.
    if (!new TextDecoder().decode(await entry.slice(0, 5).arrayBuffer()).startsWith("%PDF-")) {
      return json({ error: "A selected file is not a PDF document." }, 400);
    }
    files.push(entry);
  }
  let topicId: string | undefined;
  let stage = "create";
  try {
    topicId = await deps.create(name.trim());
    stage = "processing";
    await deps.processing(topicId);
    stage = "extract";
    const raw = await deps.extract(name.trim(), files);
    // The only path to ready passes this boundary. Never persist raw model output.
    stage = "validate";
    const rubric = DynamicRubricSchema.parse(raw);
    stage = "save";
    await deps.ready(topicId, { ...rubric, topicName: name.trim() });
    return json({ topicId });
  } catch (error) {
    // Log only bounded operational metadata, never provider messages, PDFs or keys.
    const providerStatus = error && typeof error === "object" && "status" in error
      && typeof error.status === "number" && Number.isInteger(error.status)
      && error.status >= 400 && error.status <= 599 ? error.status : undefined;
    console.error("topic_creation_failed", { stage, code: error instanceof DocumentContentError ? error.code : "operational_failure", providerStatus });
    if (topicId) {
      try { await deps.failed(topicId); }
      catch { console.error("topic_failed_status_write_failed"); }
    }
    if (stage === "extract" && error instanceof DocumentContentError) {
      return json({ error: error.message }, 422);
    }
    return json({ error: EXTRACTION_FAILURE }, 502);
  }
}
