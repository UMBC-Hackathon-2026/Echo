import { test, expect } from '@playwright/test';

test('Flow B (wrong reteach): No false improvement', async ({ page }) => {
  // Start session
  await page.goto('/');
  await page.click('text="Start teaching recursion"');

  // Wait for teaching phase
  await page.waitForSelector('textarea#teach-input');

  // Cycle 1: teach without base case
  await page.fill('textarea#teach-input', 'A function is recursive when it calls itself, and each call works on a smaller n.');
  await page.click('button:has-text("Send")');

  // Trigger assessment
  await page.click('button:has-text("Assess my learner")');

  // Wait for assessing phase to complete
  await page.waitForSelector('button:has-text("Reveal next answer"), button:has-text("Complete attempt")');
  while (await page.locator('button:has-text("Reveal next answer")').isVisible()) {
    await page.click('button:has-text("Reveal next answer")');
    await page.waitForTimeout(100);
  }
  const completeResp = page.waitForResponse(resp => resp.url().includes('/complete') && resp.status() === 200);
  await page.click('button:has-text("Complete attempt")');
  await completeResp;

  // Reviewing phase
  await expect(page.locator('text="Blocking:"').first()).toBeVisible();
  await page.locator('button:has-text("Reteach this")').first().click();

  // Reteaching phase: wrong base case (keyword-stuffed)
  await page.fill('textarea#teach-input', 'This uses recursion and has a base case and it stops, you know, when recursion finishes doing the recursion.');
  await page.click('button:has-text("Send")');

  // Trigger reassessment (form B)
  await page.click('button:has-text("Assess my learner")');

  // Wait for reassessing to complete
  await page.waitForSelector('button:has-text("Reveal next answer"), button:has-text("Complete attempt")');
  while (await page.locator('button:has-text("Reveal next answer")').isVisible()) {
    await page.click('button:has-text("Reveal next answer")');
    await page.waitForTimeout(100);
  }
  const completeResp2 = page.waitForResponse(resp => resp.url().includes('/complete') && resp.status() === 200);
  await page.click('button:has-text("Complete attempt")');
  await completeResp2;

  // Comparing phase: check that comparison shows NO improvement for termination
  await expect(page.locator('text="Start a new session"')).toBeVisible();
  // We expect no improvement, so Termination is 0 of 2 -> 0 of 2 (or something like that depending on our exact UI)
  await expect(page.locator('text=/termination: 0 of 2 -> 0 of 2/i')).toBeVisible();
});
