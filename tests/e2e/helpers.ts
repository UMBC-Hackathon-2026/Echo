import { expect, type Page } from '@playwright/test';

/** Start a fresh session from the home page and land on the teaching view. */
export async function startSession(page: Page): Promise<void> {
  await page.goto('/');
  await page.click('text="Start teaching recursion"');
  await page.waitForSelector('textarea#teach-input');
  await expect(page.locator('textarea#teach-input')).toBeEnabled();
}

/** Submit one explanation and wait for the evaluation round-trip to settle. */
export async function teach(page: Page, text: string): Promise<void> {
  const input = page.locator('textarea#teach-input');
  await expect(input).toBeEnabled();
  await input.fill(text);
  const send = page.locator('button:has-text("Send")');
  await expect(send).toBeEnabled();
  const resp = page.waitForResponse((r) => r.url().includes('/messages') && r.request().method() === 'POST');
  await send.click();
  await resp;
  // Back to a teachable, non-pending state (the Assess button reappears).
  await page.waitForSelector('button:has-text("Assess my learner")');
}

/** Run an assessment: reveal every answer, then complete the attempt. */
export async function assessAndComplete(page: Page): Promise<void> {
  await page.click('button:has-text("Assess my learner")');
  await page.waitForSelector('button:has-text("Reveal next answer"), button:has-text("Complete attempt")');
  while (await page.locator('button:has-text("Reveal next answer")').isVisible()) {
    await page.click('button:has-text("Reveal next answer")');
    await page.waitForTimeout(50);
  }
  const completed = page.waitForResponse((r) => r.url().includes('/complete') && r.status() === 200);
  await page.click('button:has-text("Complete attempt")');
  await completed;
}

/** From the review, click "Reteach this" and wait for the reteaching input. */
export async function beginReteach(page: Page): Promise<void> {
  await expect(page.getByText('Blocking:').first()).toBeVisible();
  await page.locator('button:has-text("Reteach this")').first().click();
  await expect(page.locator('textarea#teach-input')).toBeEnabled();
}
