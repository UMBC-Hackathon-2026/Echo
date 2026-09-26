import type { Form, Question, Fragment, Criterion } from "@/lib/contracts";

/**
 * Pure content validator (ARCHITECTURE_REVISED §5, "the six rules") plus the
 * structural checks from the build plan: unique ids, real concept references,
 * and pair matching. Takes content as arguments so it can run over the frozen
 * content in `scripts/check-content.ts` and over deliberately broken copies in
 * tests. Returns a list of human-readable violations; empty means valid.
 */
export interface ContentValidationInput {
  forms: Form[];
  conceptIds: readonly string[];
  seeded: Array<{ id: string; resolutionConcepts: string[]; relevantPairs: string[] }>;
}

const sortedSet = (xs: string[]): string => [...new Set(xs)].sort().join(",");

function factDemandedConcepts(f: Fragment): { concepts: string[]; allDemonstrated: boolean } {
  const concepts = f.requires.map((r) => r.concept);
  const allDemonstrated = f.requires.every((r) => r.min === "demonstrated");
  return { concepts, allDemonstrated };
}

function blockingConceptsOf(q: Question): Set<string> {
  const s = new Set<string>();
  for (const c of q.criteria) for (const concept of c.requires) s.add(concept);
  return s;
}

function validateQuestion(q: Question, conceptIds: ReadonlySet<string>, out: string[]): void {
  const where = `question ${q.id}`;

  // Unique criterion / fragment ids.
  const critIds = q.criteria.map((c) => c.id);
  if (new Set(critIds).size !== critIds.length) out.push(`[ids] ${where}: duplicate criterion id`);
  const fragIds = q.fragments.map((f) => f.id);
  if (new Set(fragIds).size !== fragIds.length) out.push(`[ids] ${where}: duplicate fragment id`);

  // Concept references are real.
  for (const c of q.criteria)
    for (const concept of c.requires)
      if (!conceptIds.has(concept)) out.push(`[concepts] ${where}: criterion ${c.id} requires unknown concept "${concept}"`);
  for (const f of q.fragments)
    for (const r of f.requires)
      if (!conceptIds.has(r.concept)) out.push(`[concepts] ${where}: fragment ${f.id} requires unknown concept "${r.concept}"`);

  const facts = q.fragments.filter((f) => f.kind === "fact");

  // Rule 1: each criterion has exactly one fact fragment whose demonstrated
  // requirements equal the criterion's concepts.
  for (const c of q.criteria) {
    const supporting = facts.filter((f) => f.supportsCriterion === c.id);
    if (supporting.length !== 1) {
      out.push(`[rule1] ${where}: criterion ${c.id} has ${supporting.length} fact fragments (need exactly 1)`);
      continue;
    }
    const fact = supporting[0];
    const { concepts, allDemonstrated } = factDemandedConcepts(fact);
    if (!allDemonstrated) out.push(`[rule1] ${where}: fact ${fact.id} must require all concepts at "demonstrated"`);
    if (sortedSet(concepts) !== sortedSet(c.requires))
      out.push(`[rule1] ${where}: fact ${fact.id} requirements {${sortedSet(concepts)}} != criterion ${c.id} concepts {${sortedSet(c.requires)}}`);
  }
  // Every fact fragment must support an existing criterion.
  for (const f of facts) {
    if (!f.supportsCriterion || !q.criteria.some((c) => c.id === f.supportsCriterion))
      out.push(`[rule1] ${where}: fact ${f.id} does not support an existing criterion`);
  }

  // Rule 2: hedges name one concept at exactState partially_taught; contexts and
  // hedges never carry supportsCriterion.
  for (const f of q.fragments) {
    if (f.kind === "hedge") {
      if (f.exactState !== "partially_taught") out.push(`[rule2] ${where}: hedge ${f.id} must set exactState "partially_taught"`);
      if (f.requires.length !== 1 || f.requires[0]?.min !== "partially_taught")
        out.push(`[rule2] ${where}: hedge ${f.id} must require exactly one concept at "partially_taught"`);
    }
    if ((f.kind === "hedge" || f.kind === "context") && f.supportsCriterion)
      out.push(`[rule2] ${where}: ${f.kind} ${f.id} must not have supportsCriterion`);
  }

  // Rule 3: every relevant misconception has a fragment and a contradictedBy criterion.
  for (const m of q.relevantMisconceptions) {
    if (!q.fragments.some((f) => f.kind === "misconception" && f.misconception === m))
      out.push(`[rule3] ${where}: relevant misconception "${m}" has no misconception fragment`);
    if (!q.criteria.some((c) => (c.contradictedBy ?? []).includes(m)))
      out.push(`[rule3] ${where}: no criterion lists "${m}" in contradictedBy`);
  }
  for (const f of q.fragments)
    if (f.kind === "misconception" && f.misconception && !q.relevantMisconceptions.includes(f.misconception))
      out.push(`[rule3] ${where}: misconception fragment ${f.id} references non-relevant "${f.misconception}"`);

  // Rule 5: exactly one uncertain fragment; a nextStep for every concept the
  // question can block and every relevant misconception.
  const uncertain = q.fragments.filter((f) => f.kind === "uncertain");
  if (uncertain.length !== 1) out.push(`[rule5] ${where}: has ${uncertain.length} uncertain fragments (need exactly 1)`);
  const needKeys = new Set<string>([...blockingConceptsOf(q), ...q.relevantMisconceptions]);
  for (const key of needKeys)
    if (!(key in q.nextStep)) out.push(`[rule5] ${where}: missing nextStep for blockable "${key}"`);
}

export function validateContent(input: ContentValidationInput): string[] {
  const out: string[] = [];
  const conceptIds = new Set(input.conceptIds);
  const allQuestions = input.forms.flatMap((f) => f.questions);

  // Unique question ids across all forms.
  const qIds = allQuestions.map((q) => q.id);
  if (new Set(qIds).size !== qIds.length) out.push(`[ids] duplicate question id across forms`);

  for (const q of allQuestions) validateQuestion(q, conceptIds, out);

  // Rule 4: pairs share pair_id, type, criteria concept sets, step count, difficulty.
  const byPair = new Map<string, Question[]>();
  for (const q of allQuestions) {
    const list = byPair.get(q.pairId) ?? [];
    list.push(q);
    byPair.set(q.pairId, list);
  }
  const critSetsSig = (q: Question): string =>
    q.criteria.map((c: Criterion) => sortedSet(c.requires)).sort().join("|");
  for (const [pairId, qs] of byPair) {
    if (qs.length < 2) out.push(`[rule4] pair ${pairId}: needs a question in both forms (found ${qs.length})`);
    const [first, ...rest] = qs;
    for (const q of rest) {
      if (q.type !== first.type) out.push(`[rule4] pair ${pairId}: type mismatch (${q.type} vs ${first.type})`);
      if (q.difficulty !== first.difficulty) out.push(`[rule4] pair ${pairId}: difficulty mismatch`);
      if (q.steps !== first.steps) out.push(`[rule4] pair ${pairId}: step count mismatch`);
      if (critSetsSig(q) !== critSetsSig(first)) out.push(`[rule4] pair ${pairId}: criteria concept sets mismatch`);
    }
  }

  // Rule 6: seeded misconception resolution concepts appear in the criteria of
  // every question it is relevant to.
  for (const s of input.seeded) {
    for (const q of allQuestions) {
      if (!q.relevantMisconceptions.includes(s.id)) continue;
      const conceptsInCriteria = new Set<string>(q.criteria.flatMap((c) => c.requires));
      for (const rc of s.resolutionConcepts)
        if (!conceptsInCriteria.has(rc))
          out.push(`[rule6] question ${q.id}: resolution concept "${rc}" for "${s.id}" missing from its criteria`);
    }
  }

  return out;
}
