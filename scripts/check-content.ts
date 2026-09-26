/**
 * Validates the frozen recursion content against the six rules in
 * ARCHITECTURE_REVISED §5 (plus structural checks). Exits non-zero with a
 * readable message on any violation. Run via `npm run check:content`.
 *
 * Invoked with `--conditions=react-server` so `import 'server-only'` resolves to
 * the empty module instead of the throwing default.
 */
import { CONCEPT_IDS } from "@/lib/contracts";
import { validateContent } from "@/lib/content/validate";
import { FORMS } from "@/lib/content/recursion/forms";
import { SEEDED_MISCONCEPTIONS } from "@/lib/content/recursion/misconceptions";

const violations = validateContent({
  forms: FORMS,
  conceptIds: CONCEPT_IDS,
  seeded: SEEDED_MISCONCEPTIONS.map((m) => ({
    id: m.id,
    resolutionConcepts: m.resolutionConcepts,
    relevantPairs: m.relevantPairs,
  })),
});

if (violations.length > 0) {
  console.error(`check:content FAILED — ${violations.length} violation(s):`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log(
  `check:content OK — ${FORMS.length} forms, ${FORMS.flatMap((f) => f.questions).length} questions pass all six rules.`,
);
