import { z } from "zod";
import { DynamicRubricShape } from "@/lib/contracts/dynamic-rubric";

export const ExtractionResultSchema = z.object({
  status: z.enum(["readable", "unreadable_pdf", "insufficient_material"]),
  rubric: z.unknown(),
}).strict();

// Keep the wire shape derived from the contract, but enforce lengths, patterns,
// and collection limits locally. Sending those constraints together caused
// Gemini to reject this rubric schema with HTTP 400 INVALID_ARGUMENT.
const localConstraints = new Set(["$schema", "minLength", "maxLength", "pattern", "minItems", "maxItems"]);
function generationSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(generationSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !localConstraints.has(key)).map(([key, child]) => [
    key,
    key === "properties" && child && typeof child === "object"
      ? Object.fromEntries(Object.entries(child).map(([name, schema]) => [name, generationSchema(schema)]))
      : generationSchema(child),
  ]));
}

export const rubricGenerationSchema = generationSchema(z.toJSONSchema(z.object({
  status: z.enum(["readable", "unreadable_pdf", "insufficient_material"]),
  rubric: DynamicRubricShape.nullable(),
}).strict()));
