import { test, expect, type Page } from '@playwright/test';
import { startSession, teach, assessAndComplete, beginReteach } from './helpers';

/**
 * Live E2E for the teammate's manual run (npm run e2e:live) against real Gemini.
 * It is NOT in CI and never runs in the scripted suite. It asserts CONSISTENCY,
 * not exact scores: what the UI shows must equal the pinned records from GET,
 * and any score change must be backed by a concept-state change between the two
 * pinned records. Flow B additionally fails loudly on evaluator over-credit.
 */

const RANK: Record<string, number> = { not_taught: 0, partially_taught: 1, demonstrated: 2 };
const P1_CONCEPTS = ['base_case', 'smaller_subproblem', 'progress_toward_base_case'] as const;

type ResultDTO = { pairId: string; points: number; maxPoints: number; answerText: string };
type AttemptDTO = { attemptNo: number; results: ResultDTO[]; pinnedRecord: { concepts: Record<string, { state: string }> } };
type SessionDTO = { phase: string; attempts: AttemptDTO[] };

async function getSession(page: Page): Promise<SessionDTO> {
  const id = page.url().split('/session/')[1];
  const res = await page.request.get(`/api/sessions/${id}`);
  expect(res.ok(), 'GET /api/sessions/[id] must succeed').toBeTruthy();
  return (await res.json()) as SessionDTO;
}

/** Every displayed comparison value must equal the pinned records returned by GET. */
async function assertUiMatchesRecords(page: Page, dto: SessionDTO) {
  const a1 = dto.attempts.find((a) => a.attemptNo === 1)!;
  const a2 = dto.attempts.find((a) => a.attemptNo === 2)!;
  expect(a1, 'attempt 1 present').toBeTruthy();
  expect(a2, 'attempt 2 present').toBeTruthy();
  for (const r2 of a2.results) {
    const r1 = a1.results.find((r) => r.pairId === r2.pairId)!;
    const row = page.getByTestId(`compare-${r2.pairId}`);
    await expect(row, `comparison row for ${r2.pairId} is rendered`).toBeVisible();
    await expect(row).toHaveAttribute('data-before-points', String(r1.points));
    await expect(row).toHaveAttribute('data-after-points', String(r2.points));
    await expect(row).toHaveAttribute('data-improved', String(r2.points > r1.points));
    await expect(page.getByTestId(`compare-${r2.pairId}-before-answer`)).toHaveText(r1.answerText);
    await expect(page.getByTestId(`compare-${r2.pairId}-after-answer`)).toHaveText(r2.answerText);
  }
}

/** A score change must be backed by a concept-state change between the pinned records. */
function assertDirectionMatchesConcepts(dto: SessionDTO) {
  const a1 = dto.attempts.find((a) => a.attemptNo === 1)!;
  const a2 = dto.attempts.find((a) => a.attemptNo === 2)!;
  const p1a = a1.results.find((r) => r.pairId === 'P1')!;
  const p1b = a2.results.find((r) => r.pairId === 'P1')!;
  const conceptGain = P1_CONCEPTS.some(
    (c) => RANK[a2.pinnedRecord.concepts[c].state] > RANK[a1.pinnedRecord.concepts[c].state],
  );
  const conceptLoss = P1_CONCEPTS.some(
    (c) => RANK[a2.pinnedRecord.concepts[c].state] < RANK[a1.pinnedRecord.concepts[c].state],
  );
  if (p1b.points > p1a.points) {
    expect(conceptGain, 'a P1 score gain must be backed by a concept-state gain in the pinned records').toBe(true);
  }
  if (p1b.points < p1a.points) {
    expect(conceptLoss, 'a P1 score drop must be backed by a concept-state loss in the pinned records').toBe(true);
  }
}

test('Live Flow A: displayed comparison is consistent with the pinned records @live', async ({ page }) => {
  await startSession(page);
  await teach(page, 'A function is recursive when it calls itself, and each call works on a smaller n.');
  await assessAndComplete(page);
  await beginReteach(page);
  await teach(page, 'It stops when n reaches 0: at n === 0 it returns without calling itself again.');
  await assessAndComplete(page);

  const dto = await getSession(page);
  expect(dto.phase).toBe('comparing');
  await assertUiMatchesRecords(page, dto);
  assertDirectionMatchesConcepts(dto);
});

test('Live Flow B: a wrong reteach must not over-credit or falsely improve @live', async ({ page }) => {
  await startSession(page);
  await teach(page, 'A function is recursive when it calls itself, and each call works on a smaller n.');
  await assessAndComplete(page);
  await beginReteach(page);
  await teach(page, 'This uses recursion and has a base case and it stops, you know, when recursion finishes doing the recursion.');
  await assessAndComplete(page);

  const dto = await getSession(page);
  expect(dto.phase).toBe('comparing');
  await assertUiMatchesRecords(page, dto);
  assertDirectionMatchesConcepts(dto);

  const a1 = dto.attempts.find((a) => a.attemptNo === 1)!;
  const a2 = dto.attempts.find((a) => a.attemptNo === 2)!;
  const baseCaseAfter = a2.pinnedRecord.concepts.base_case.state;
  if (baseCaseAfter === 'demonstrated') {
    // The wrong explanation stated no concrete stopping condition. Crediting it
    // is a real evaluator defect — fail loudly, never pass silently.
    throw new Error('evaluator over-credit: base_case credited for the wrong explanation');
  }
  const p1a = a1.results.find((r) => r.pairId === 'P1')!;
  const p1b = a2.results.find((r) => r.pairId === 'P1')!;
  expect(p1b.points, 'P1 must not improve when base_case is not demonstrated').toBeLessThanOrEqual(p1a.points);
});
