/**
 * Gemini structured output rejects these otherwise-valid JSON Schema keywords
 * for the models used by this app. Keep the full constraints in Zod and the
 * semantic validator, and send the provider only the compatible wire shape.
 */
const UNSUPPORTED_CONSTRAINTS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
]);

export function geminiCompatibleJsonSchema<T>(value: T): T {
  if (Array.isArray(value)) return value.map(geminiCompatibleJsonSchema) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      UNSUPPORTED_CONSTRAINTS.has(key)
        ? []
        : [[key, geminiCompatibleJsonSchema(child)]],
    ),
  ) as T;
}
