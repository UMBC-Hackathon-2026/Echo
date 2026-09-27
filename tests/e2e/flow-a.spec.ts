import { test, expect } from '@playwright/test';
import { startSession, teach, assessAndComplete, beginReteach } from './helpers';

/**
 * Flow A — the demo path. With the scripted evaluator this is fully
 * deterministic and asserts the OUTCOME, not just rendering: a correct
 * base-case reteach must lift P1 from 0/2 to 2/2, move base_case from
 * not_taught to demonstrated, and resolve the seeded belief.
 */
test('Flow A demo path proves improvement @scripted', async ({ page }) => {
  await startSession(page);

  // Cycle 1: teach recursion but omit the base case.
  await teach(page, 'A function is recursive when it calls itself, and each call works on a smaller n.');
  await assessAndComplete(page);

  // Cycle 2: reteach the base case correctly.
  await beginReteach(page);
  await teach(page, 'It stops when n reaches 0: at n === 0 it returns without calling itself again.');
  await assessAndComplete(page);

  // Comparison: P1 improves 0/2 -> 2/2.
  const p1 = page.getByTestId('compare-P1');
  await expect(p1).toBeVisible();
  await expect(p1).toHaveAttribute('data-before-points', '0');
  await expect(p1).toHaveAttribute('data-after-points', '2');
  await expect(p1).toHaveAttribute('data-improved', 'true');
  await expect(p1).toContainText('0 of 2');
  await expect(p1).toContainText('2 of 2');

  // base_case: not_taught -> demonstrated.
  const baseCase = page.getByTestId('concept-change-base_case');
  await expect(baseCase).toHaveAttribute('data-before', 'not_taught');
  await expect(baseCase).toHaveAttribute('data-after', 'demonstrated');

  // Seeded belief is resolved.
  await expect(page.getByTestId('belief-status')).toHaveAttribute('data-resolved', 'true');

  await expect(page.getByText('Start a new session')).toBeVisible();
});
