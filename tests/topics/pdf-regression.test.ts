import { expect, it, vi } from "vitest";
import type { GoogleGenAI } from "@google/genai";
import { extractRubric } from "@/lib/topics/extract";

it("sends native PDFs with a schema accepted by the provider", async () => {
  const rubric = { topicName: "Watershed", concepts: [], misconceptions: [], questions: [] };
  const generateContent = vi.fn(async (request) => {
    // The original request failed live with 400 INVALID_ARGUMENT. Removing
    // these generation constraints succeeded; full Zod validation stays local.
    const schema = JSON.stringify(request.config.responseJsonSchema);
    expect(schema).not.toMatch(/"(?:\$schema|minLength|maxLength|pattern|minItems|maxItems)":/);
    expect(request.contents.filter((part: { fileData?: unknown }) => part.fileData)).toHaveLength(10);
    return { text: JSON.stringify(request.config.responseJsonSchema.properties.rubric
      ? { status: "readable", rubric } : rubric) };
  });
  const ai = {
    files: { upload: vi.fn(async () => ({ name: "files/test", uri: "https://example.invalid/pdf", state: "ACTIVE" })), delete: vi.fn(async () => ({})) },
    models: { generateContent },
  };
  const files = Array.from({ length: 10 }, () => new File(["%PDF-1.7"], "notes.pdf", { type: "application/pdf" }));
  expect(await extractRubric("Watershed", files, ai as unknown as GoogleGenAI)).toEqual(rubric);
  expect(generateContent).toHaveBeenCalledTimes(1);
});
