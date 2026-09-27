import { describe, expect, it, vi } from "vitest";
import type { GoogleGenAI } from "@google/genai";
import { extractRubric } from "@/lib/topics/extract";

function client() {
  return {
    files: { upload: vi.fn(async () => ({ name: "files/test", uri: "https://example.invalid/file", state: "ACTIVE" })), delete: vi.fn(async () => ({})) },
    models: { generateContent: vi.fn(async () => ({ text: '{"status":"readable","rubric":{"concepts":[]}}' })) },
  };
}
const file = () => new File(["%PDF-1.7"], "test.pdf", { type: "application/pdf" });

describe("Gemini extraction cleanup", () => {
  it("uses Blob upload, a strict response schema, and deletes after success", async () => {
    const ai = client();
    expect(await extractRubric("Biology", [file()], ai as unknown as GoogleGenAI)).toEqual({ concepts: [] });
    expect(ai.files.upload.mock.calls[0]).toBeDefined();
    expect(ai.models.generateContent).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ responseJsonSchema: expect.objectContaining({ additionalProperties: false }) }) }));
    expect(ai.files.delete).toHaveBeenCalledWith(expect.objectContaining({ name: "files/test" }));
  });
  it.each(["provider failure", "malformed JSON", "empty output"])("deletes after %s", async kind => {
    const ai = client();
    if (kind === "provider failure") ai.models.generateContent.mockRejectedValue(new Error("private"));
    else ai.models.generateContent.mockResolvedValue({ text: kind === "empty output" ? "" : "not json" });
    await expect(extractRubric("Biology", [file()], ai as unknown as GoogleGenAI)).rejects.toThrow();
    expect(ai.files.delete).toHaveBeenCalledTimes(1);
    expect(ai.models.generateContent).toHaveBeenCalledTimes(1);
  });
  it("cleans earlier uploads when a later upload fails", async () => {
    const ai = client(); ai.files.upload.mockResolvedValueOnce({ name: "files/first", uri: "https://example.invalid/file", state: "ACTIVE" }).mockRejectedValueOnce(new Error("upload failure"));
    await expect(extractRubric("Biology", [file(), file()], ai as unknown as GoogleGenAI)).rejects.toThrow();
    expect(ai.files.delete).toHaveBeenCalledWith(expect.objectContaining({ name: "files/first" }));
    expect(ai.models.generateContent).not.toHaveBeenCalled();
  });
  it("attempts all deletions without discarding a successful result", async () => {
    const ai = client(); ai.files.delete.mockRejectedValueOnce(new Error("delete failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(extractRubric("Biology", [file(), file()], ai as unknown as GoogleGenAI)).resolves.toEqual({ concepts: [] });
      expect(ai.files.delete).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledWith("topic_file_cleanup_failed");
    } finally { log.mockRestore(); }
  });
});

it.each(["unreadable_pdf", "insufficient_material"])("reports explicit document outcome %s", async status => {
  const ai = client();
  ai.models.generateContent.mockResolvedValue({ text: JSON.stringify({ status, rubric: null }) });
  await expect(extractRubric("Watershed", [file()], ai as unknown as GoogleGenAI)).rejects.toMatchObject({ code: status });
});

it("waits for processing files before generating", async () => {
  const ai = { ...client(), files: { ...client().files, get: vi.fn(async () => ({ name: "files/test", uri: "https://example.invalid/file", state: "ACTIVE" })) } };
  ai.files.upload.mockResolvedValue({ name: "files/test", uri: "https://example.invalid/file", state: "PROCESSING" });
  await extractRubric("Watershed", [file()], ai as unknown as GoogleGenAI);
  expect(ai.files.get).toHaveBeenCalledTimes(1);
  expect(ai.files.get.mock.invocationCallOrder[0]).toBeLessThan(ai.models.generateContent.mock.invocationCallOrder[0]);
});

it("rejects truncated responses even if their JSON happens to parse", async () => {
  const ai = client();
  ai.models.generateContent.mockResolvedValue(Object.assign({ text: '{"status":"readable","rubric":{}}' }, { candidates: [{ finishReason: "MAX_TOKENS" }] }));
  await expect(extractRubric("Watershed", [file()], ai as unknown as GoogleGenAI)).rejects.toThrow("incomplete_output");
});

it("does not replace a provider error when cleanup also fails", async () => {
  const ai = client();
  ai.models.generateContent.mockRejectedValue(new Error("provider failure"));
  ai.files.delete.mockRejectedValue(new Error("cleanup failure"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try { await expect(extractRubric("Watershed", [file()], ai as unknown as GoogleGenAI)).rejects.toThrow("provider failure"); }
  finally { log.mockRestore(); }
});
