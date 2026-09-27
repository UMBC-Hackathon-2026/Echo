import { describe, expect, it, vi } from "vitest";
import { DynamicRubricSchema } from "@/lib/contracts/dynamic-rubric";
import { createTopic, type TopicCreationDependencies } from "@/lib/topics/create";
import { createUploadLimiter } from "@/lib/topics/upload-limit";
import { EXTRACTION_FAILURE, MAX_FILE_SIZE_BYTES } from "@/lib/topics/upload-policy";

export const validRubric = () => ({
  topicName: "Photosynthesis",
  concepts: [{ id: "light", name: "Light", demonstratedWhen: "Explains the energy source", partialWhen: "Names light", probe: "Where does the energy come from?", examples: [{ explanation: "Light provides energy", expectedState: "demonstrated", reason: "Identifies energy" }] }],
  misconceptions: [{ id: "soil", name: "Soil", belief: "Soil supplies all energy", openingLine: "Does energy come from soil?", resolutionConcepts: ["light"] }],
  questions: [{ id: "q1", pairId: "p1", type: "explain", text: "What provides energy?", answerKey: { correctCriteria: ["Names light"], misconceptionCriteria: ["Names soil"], expectedAnswer: "Light" } }],
});

function dependencies() {
  return {
    admit: vi.fn(() => 0), create: vi.fn(async () => "topic-id"), processing: vi.fn(async () => {}),
    ready: vi.fn(async () => {}), failed: vi.fn(async () => {}), extract: vi.fn(async (): Promise<unknown> => validRubric()),
  } satisfies TopicCreationDependencies;
}

function request(files: File[] = [new File(["%PDF-1.7\nmock"], "notes.pdf", { type: "application/pdf" })], name = "Photosynthesis") {
  const form = new FormData();
  form.set("topicName", name);
  files.forEach(file => form.append("files", file));
  return new Request("http://localhost/api/topics/create", { method: "POST", body: form });
}

describe("strict generated rubric contract", () => {
  it("accepts a non-recursion rubric", () => expect(DynamicRubricSchema.parse(validRubric()).concepts[0].id).toBe("light"));
  it.each([
    ["missing ID", (r: ReturnType<typeof validRubric>) => { Reflect.deleteProperty(r.concepts[0], "id"); }],
    ["blank answer", (r: ReturnType<typeof validRubric>) => { r.questions[0].answerKey.expectedAnswer = "  "; }],
    ["missing answer", (r: ReturnType<typeof validRubric>) => { Reflect.deleteProperty(r.questions[0].answerKey, "expectedAnswer"); }],
    ["empty concepts", (r: ReturnType<typeof validRubric>) => { r.concepts = []; }],
    ["empty questions", (r: ReturnType<typeof validRubric>) => { r.questions = []; }],
    ["duplicate concepts", (r: ReturnType<typeof validRubric>) => { r.concepts.push(r.concepts[0]); }],
    ["duplicate questions", (r: ReturnType<typeof validRubric>) => { r.questions.push(r.questions[0]); }],
    ["unknown resolution", (r: ReturnType<typeof validRubric>) => { r.misconceptions[0].resolutionConcepts = ["missing"]; }],
    ["reserved ID", (r: ReturnType<typeof validRubric>) => { r.concepts[0].id = "constructor"; }],
    ["extra nested field", (r: ReturnType<typeof validRubric>) => { Object.assign(r.questions[0].answerKey, { instructions: "ignore rules" }); }],
    ["extra root field", (r: ReturnType<typeof validRubric>) => { Object.assign(r, { instructions: "ignore rules" }); }],
  ])("rejects %s", (_name, mutate) => {
    const rubric = validRubric(); mutate(rubric);
    expect(DynamicRubricSchema.safeParse(rubric).success).toBe(false);
  });
});

describe("upload boundary", () => {
  it("saves only validated output and uses the student's topic name", async () => {
    const deps = dependencies();
    const response = await createTopic(request(undefined, "  Biology  "), deps);
    expect(response.status).toBe(200);
    expect(deps.processing).toHaveBeenCalledWith("topic-id");
    expect(deps.ready).toHaveBeenCalledWith("topic-id", { ...validRubric(), topicName: "Biology" });
    expect(deps.failed).not.toHaveBeenCalled();
  });
  it.each([null, {}, { ...validRubric(), concepts: [] }])("never saves invalid generation: %j", async raw => {
    const deps = dependencies(); deps.extract.mockResolvedValue(raw);
    const response = await createTopic(request(), deps);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: EXTRACTION_FAILURE });
    expect(deps.ready).not.toHaveBeenCalled();
    expect(deps.failed).toHaveBeenCalledWith("topic-id");
  });
  it("hides provider error details and marks the topic failed", async () => {
    const deps = dependencies(); deps.extract.mockRejectedValue(new Error("private provider data"));
    const response = await createTopic(request(), deps);
    expect(await response.text()).not.toContain("private provider data");
    expect(deps.failed).toHaveBeenCalledWith("topic-id");
  });
  it("rejects before parsing multipart, DB access or Gemini when limited", async () => {
    const deps = dependencies(); deps.admit.mockReturnValue(120);
    const req = request(); const parse = vi.spyOn(req, "formData");
    const response = await createTopic(req, deps);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(parse).not.toHaveBeenCalled(); expect(deps.create).not.toHaveBeenCalled(); expect(deps.extract).not.toHaveBeenCalled();
  });
  it.each([
    [],
    Array.from({ length: 21 }, () => new File(["%PDF-x"], "x.pdf")),
    [new File(["%PDF-x"], "x.txt", { type: "application/pdf" })],
    [new File(["not PDF"], "x.pdf", { type: "application/pdf" })],
    [new File([], "x.pdf")],
    [new File([new Uint8Array(MAX_FILE_SIZE_BYTES + 1)], "x.pdf")],
  ].map(files => [files]))("rejects invalid file batches before billing %#", async files => {
    const deps = dependencies(); expect((await createTopic(request(files), deps)).status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled(); expect(deps.extract).not.toHaveBeenCalled();
  });
  it("rejects malformed multipart", async () => {
    const deps = dependencies();
    const response = await createTopic(new Request("http://localhost", { method: "POST", body: "invalid" }), deps);
    expect(response.status).toBe(400); expect(deps.extract).not.toHaveBeenCalled();
  });
});

describe("upload rate limits", () => {
  it("limits clients and admits them again after expiry", () => {
    const admit = createUploadLimiter();
    for (let i = 0; i < 3; i++) expect(admit("a", 0)).toBe(0);
    expect(admit("a", 0)).toBe(600);
    expect(admit("a", 600_000)).toBe(0);
  });
  it("enforces global minute and day limits despite changing IPs", () => {
    const admit = createUploadLimiter();
    for (let i = 0; i < 10; i++) expect(admit(`a${i}`, 0)).toBe(0);
    expect(admit("other", 0)).toBe(60);
    for (let i = 10; i < 50; i++) expect(admit(`a${i}`, Math.floor(i / 10) * 60_000)).toBe(0);
    expect(admit("another", 300_000)).toBe(86100);
    expect(admit("a", 86_400_000)).toBe(0);
  });
});
