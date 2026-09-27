import { test, expect } from "@playwright/test";

test("@scripted topic extraction failure preserves documents for retry", async ({ page }) => {
  let uploads = 0;
  await page.route("**/api/topics/create", async route => {
    uploads++;
    await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "We couldn't extract enough clear concepts from these documents. Please try adding more structured study guides." }) });
  });
  await page.goto("/");
  await page.getByLabel("Topic Name").fill("Photosynthesis");
  await page.locator('input[type="file"]').setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nmock") });
  await page.getByRole("button", { name: "Start teaching", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("We couldn't extract enough clear concepts from these documents. Please try adding more structured study guides.");
  await page.getByRole("button", { name: "Review documents and try again" }).click();
  await expect(page.getByLabel("Topic Name")).toHaveValue("Photosynthesis");
  await expect(page.getByText(/notes.pdf/)).toBeVisible();
  expect(uploads).toBe(1);
});

test("@scripted upload rate limit gives a retry delay without automatic retries", async ({ page }) => {
  let uploads = 0;
  await page.route("**/api/topics/create", async route => {
    uploads++;
    await route.fulfill({ status: 429, headers: { "Retry-After": "120" }, contentType: "application/json", body: JSON.stringify({ error: "Too many uploads. Please wait before trying again." }) });
  });
  await page.goto("/");
  await page.getByLabel("Topic Name").fill("Biology");
  await page.locator('input[type="file"]').setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nmock") });
  await page.getByRole("button", { name: "Start teaching", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Try again in 120 seconds.");
  expect(uploads).toBe(1);
});
