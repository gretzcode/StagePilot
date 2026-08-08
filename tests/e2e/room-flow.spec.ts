import { test, expect } from "@playwright/test";

test.describe("StagePilot Room E2E Flow Placeholder", () => {
  test("should display landing page and navigate to host login", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Authoritative Realtime Stage Control");

    await page.click("text=Host Login");
    await expect(page).toHaveURL("/login");
    await expect(page.locator("h1")).toContainText("Host Authentication");
  });

  test("should allow guest pairing room code entry", async ({ page }) => {
    await page.goto("/join");
    await expect(page.locator("h1")).toContainText("Join Stage Room");
  });
});
