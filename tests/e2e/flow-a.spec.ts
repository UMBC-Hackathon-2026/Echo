import { test, expect } from '@playwright/test';

test('Flow A (demo path): Review, Reteach, Comparison', async ({ page }) => {
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

  // Wait for assessing phase to complete by clicking "Reveal next answer" until "Complete attempt" appears
  await page.waitForSelector('button:has-text("Reveal next answer"), button:has-text("Complete attempt")');
  while (await page.locator('button:has-text("Reveal next answer")').isVisible()) {
    await page.click('button:has-text("Reveal next answer")');
    await page.waitForTimeout(100); // small delay to let React render
  }
  // complete the attempt
  const completeResp = page.waitForResponse(resp => resp.url().includes('/complete') && resp.status() === 200);
  await page.click('button:has-text("Complete attempt")');
  await completeResp;

  // Reviewing phase: check review shows base_case blocking
  await expect(page.locator('text="Blocking:"').first()).toBeVisible();
  // Click Reteach this for base_case (assumes P1 is terminated/base_case)
  await page.locator('button:has-text("Reteach this")').first().click();

  // Reteaching phase: teach base case
  await page.fill('textarea#teach-input', 'It stops when n reaches 0: at n === 0 it returns without calling itself again.');
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

  // Comparing phase: check that comparison shows improvement
  await expect(page.locator('text="Start a new session"')).toBeVisible();
  await expect(page.locator('text=/termination:/i').first()).toBeVisible();
});
