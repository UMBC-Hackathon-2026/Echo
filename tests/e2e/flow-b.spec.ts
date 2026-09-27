import { test, expect } from '@playwright/test';
import { startSession, teach, assessAndComplete, beginReteach } from './helpers';

/**
 * Flow B — the wrong reteach. A keyword-stuffed explanation that names a
 * "base case" but never states a concrete stopping condition must NOT improve
 * P1: base_case stays not_taught, the seeded belief stays active, and the
 * comparison shows no gain. This is the rehearsed "no false improvement" demo.
 */
test('Flow B wrong reteach shows no false improvement @scripted', async ({ page }) => {
  await startSession(page);

  // Cycle 1: same starting explanation, base case omitted.
  await teach(page, 'A function is recursive when it calls itself, and each call works on a smaller n.');
  await assessAndComplete(page);

  // Cycle 2: a wrong, keyword-stuffed reteach with no real stopping condition.
  await beginReteach(page);
  await teach(page, 'This uses recursion and has a base case and it stops, you know, when recursion finishes doing the recursion.');
  await assessAndComplete(page);

  // Comparison: P1 does NOT improve (0/2 -> 0/2).
  const p1 = page.getByTestId('compare-P1');
  await expect(p1).toBeVisible();
  await expect(p1).toHaveAttribute('data-before-points', '0');
  await expect(p1).toHaveAttribute('data-after-points', '0');
  await expect(p1).toHaveAttribute('data-improved', 'false');
  await expect(p1).toContainText('0 of 2 → 0 of 2');

  // base_case never reached demonstrated; the seeded belief stays active.
  const baseCase = page.getByTestId('concept-change-base_case');
  await expect(baseCase).toHaveAttribute('data-after', 'not_taught');
  await expect(page.getByTestId('belief-status')).toHaveAttribute('data-resolved', 'false');
});
