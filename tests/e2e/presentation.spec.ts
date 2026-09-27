import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

const SCREENSHOTS = 'reports/screenshots';
const CYCLE_ONE = 'A function is recursive when it calls itself, and each call works on a smaller n.\n```ts\nreturn recurse(n - 1);\n```';
const CYCLE_TWO = 'It stops when n reaches 0: at n === 0 it returns without calling itself again.';

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 40; i += 1) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Keyboard focus did not reach the requested control');
}

async function activate(page: Page, target: Locator) {
  await tabTo(page, target);
  await expect(target).toBeFocused();
  await page.keyboard.press('Enter');
}

async function sendFromKeyboard(page: Page, text: string) {
  const input = page.locator('textarea#teach-input');
  await tabTo(page, input);
  await page.keyboard.type(text);
  const response = page.waitForResponse((r) => r.url().includes('/messages') && r.request().method() === 'POST');
  await activate(page, page.getByRole('button', { name: 'Send explanation' }));
  expect((await response).ok()).toBe(true);
  await expect(page.getByRole('button', { name: 'Assess my learner' })).toBeEnabled();
  await expect(page.locator('[aria-live="polite"]')).toContainText('Evaluated explanation');
}

async function beginAssessment(page: Page) {
  const response = page.waitForResponse((r) => r.url().includes('/attempts') && r.request().method() === 'POST');
  await activate(page, page.getByRole('button', { name: 'Assess my learner' }));
  expect((await response).ok()).toBe(true);
  await expect(page.getByRole('button', { name: 'Reveal next answer' })).toBeVisible();
}

async function revealAll(page: Page) {
  const reveal = page.getByRole('button', { name: 'Reveal next answer' });
  while (await reveal.isVisible().catch(() => false)) {
    await activate(page, reveal);
    await expect(page.locator('[aria-live="polite"]')).toContainText('Answer revealed:');
  }
}

async function completeAttempt(page: Page) {
  const response = page.waitForResponse((r) => r.url().includes('/complete') && r.request().method() === 'POST');
  await activate(page, page.getByRole('button', { name: 'Complete attempt' }));
  expect((await response).ok()).toBe(true);
}

async function assertDesktopPanels(page: Page) {
  const panels = page.locator('section[aria-label="Teach panel"], section[aria-label="Concept map"], section[aria-label="Assessment panel"]');
  await expect(panels).toHaveCount(3);
  const boxes = await panels.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));
  expect(boxes[0].right).toBeLessThanOrEqual(boxes[1].left);
  expect(boxes[1].right).toBeLessThanOrEqual(boxes[2].left);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function capture(page: Page, filename: string) {
  await page.locator('nextjs-portal').evaluate((element) => { (element as HTMLElement).style.display = 'none'; }).catch(() => {});
  await page.screenshot({ path: `${SCREENSHOTS}/${filename}`, fullPage: true, animations: 'disabled' });
}

test('keyboard-only demo path and phase screenshots @scripted', async ({ page }) => {
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await expect(page.getByTestId('pdf-drop-zone')).toBeVisible();
  await capture(page, '00-home.png');
  await activate(page, page.getByRole('button', { name: 'Start teaching recursion' }));
  await expect(page.locator('textarea#teach-input')).toBeEnabled();
  await expect(page.getByLabel('Loading session workspace')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Paste demo explanation' })).toBeVisible();
  await assertDesktopPanels(page);
  await capture(page, '01-teaching.png');

  await sendFromKeyboard(page, CYCLE_ONE);
  await expect(page.locator('.message-code code')).toContainText('return recurse(n - 1);');
  await beginAssessment(page);
  await capture(page, '02-assessing.png');
  await revealAll(page);
  await completeAttempt(page);
  await expect(page.getByText('Blocking:').first()).toBeVisible();
  await activate(page, page.locator('button[aria-pressed]').first());
  await capture(page, '03-reviewing.png');

  const reteachResponse = page.waitForResponse((r) => r.url().includes('/reteach') && r.request().method() === 'POST');
  await activate(page, page.getByRole('button', { name: 'Reteach this' }).first());
  expect((await reteachResponse).ok()).toBe(true);
  await expect(page.locator('textarea#teach-input')).toBeFocused();
  await capture(page, '04-reteaching.png');

  await page.keyboard.type(CYCLE_TWO);
  const teachResponse = page.waitForResponse((r) => r.url().includes('/messages') && r.request().method() === 'POST');
  await activate(page, page.getByRole('button', { name: 'Send explanation' }));
  expect((await teachResponse).ok()).toBe(true);
  await beginAssessment(page);
  await capture(page, '05-reassessing.png');
  await revealAll(page);
  await completeAttempt(page);
  await expect(page.getByTestId('compare-P1')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Before and after comparison' })).toBeVisible();
  await capture(page, '06-comparing.png');

  await page.setViewportSize({ width: 1920, height: 1080 });
  await assertDesktopPanels(page);
  await capture(page, '07-comparing-1920.png');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await capture(page, '08-comparing-narrow.png');

  await activate(page, page.getByRole('link', { name: 'Start a new session' }));
  await expect(page.getByRole('button', { name: 'Start teaching recursion' })).toBeVisible();
});
