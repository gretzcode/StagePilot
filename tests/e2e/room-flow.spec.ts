import { test, expect } from "@playwright/test";

test.describe("StagePilot Room Lifecycle & Core Runtime E2E Suite", () => {
  test("Host Login -> Multiple Independent Room Creation -> Guest Join -> Unified Device Approval -> Realtime Sync", async ({
    browser,
  }) => {
    test.setTimeout(60000);

    // 1. Context A: HOST
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();

    // Navigate to Login
    await hostPage.goto("/login");
    await expect(hostPage.locator("h1")).toContainText("Host Authentication");

    // Login with Host credentials
    await hostPage.fill('input[type="email"]', "host@kian.co");
    await hostPage.fill('input[type="password"]', "password1234");
    await Promise.all([
      hostPage.waitForURL(/\/dashboard/, { timeout: 15000 }),
      hostPage.click('button[type="submit"]'),
    ]);

    // Should redirect to Dashboard
    await expect(hostPage).toHaveURL(/\/dashboard/);
    await expect(hostPage.locator("header")).toContainText("host@kian.co", { timeout: 15000 });

    // Get initial room count and Room A code
    const roomCodeElements = hostPage.locator('button:has-text("ROOM:")');
    const initialCount = await roomCodeElements.count();
    expect(initialCount).toBeGreaterThanOrEqual(1);

    const roomCodeA = (await roomCodeElements.first().innerText()).replace(/^ROOM:\s*/i, "").replace(/[^A-Z0-9]/gi, "").trim();
    expect(roomCodeA.length).toBeGreaterThanOrEqual(4);

    // Create Room B via Modal
    await hostPage.click("text=Create New Room");
    await hostPage.waitForTimeout(300);
    await hostPage.fill('input[type="text"]', "Secondary Room B");
    await hostPage.click('button:has-text("Buat Room")');
    await hostPage.waitForTimeout(500);

    // Verify Room B is created and room count increased by 1
    await expect(roomCodeElements).toHaveCount(initialCount + 1, { timeout: 10000 });
    const newCount = await roomCodeElements.count();
    expect(newCount).toBe(initialCount + 1);

    const roomCodeB = (await roomCodeElements.first().innerText()).replace(/^ROOM:\s*/i, "").replace(/[^A-Z0-9]/gi, "").trim();
    expect(roomCodeB.length).toBeGreaterThanOrEqual(4);
    expect(roomCodeB).not.toBe(roomCodeA);

    // Enter Room A Control Room
    await hostPage.locator(`a[href*="/control?roomCode=${roomCodeA}"]`).first().click();
    await expect(hostPage).toHaveURL(new RegExp(`/control\\?roomCode=${roomCodeA}`));
    await expect(hostPage.locator("header")).toContainText(roomCodeA);

    // 2. Context B: GUEST CONTROL (Joining Room A)
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    await guestPage.goto("/join");
    await expect(guestPage.locator("h1")).toContainText("Join Stage Room");

    // Test Invalid Room Code Join Rejection with Friendly Error (BB-18 / P1-1)
    await guestPage.fill('input[placeholder="e.g. A7K9P2"]', "FAKE99");
    await guestPage.fill('input[placeholder="e.g. Backstage iPad / Stage Left"]', "Backstage iPad");
    await guestPage.click('button[type="submit"]');
    await expect(guestPage.locator("text=Room tidak ditemukan")).toBeVisible();

    // Now Join Valid Room A as Control
    await guestPage.fill('input[placeholder="e.g. A7K9P2"]', roomCodeA);
    await guestPage.fill('input[placeholder="e.g. Backstage iPad / Stage Left"]', "Backstage iPad");
    await guestPage.click('button[type="submit"]');

    // Guest should be in PENDING state waiting for host approval (P0-1)
    await expect(guestPage.locator("h1")).toContainText("Menunggu persetujuan Host");

    // 3. Context A (Host): Approve Pending Device
    await hostPage.bringToFront();
    await expect(hostPage.locator("text=Backstage iPad")).toBeVisible({ timeout: 15000 });
    await hostPage.click('button:has-text("Approve")');

    // 4. Context B (Guest Control): Should be approved and redirected to Master Control Room
    await guestPage.bringToFront();
    await expect(guestPage).toHaveURL(new RegExp(`/control\\?roomCode=${roomCodeA}`), { timeout: 10000 });
    await expect(guestPage.locator("header")).toContainText("SP");

    // 5. Context C: AUDIENCE DISPLAY (Joining Room A) - Requires Approval (P0-1)
    const audienceContext = await browser.newContext();
    const audienceDeviceId = `dev-aud-e2e-${Date.now()}`;
    await audienceContext.addInitScript(({ key, val }) => {
      window.localStorage.setItem(key, val);
    }, { key: `stagepilot_dev_id_audience_${roomCodeA}`, val: audienceDeviceId });

    const audiencePage = await audienceContext.newPage();
    await audiencePage.goto(`/display/audience?roomCode=${roomCodeA}`);

    // Must show Pending Approval before Host approves! (BB-FIX-01)
    await expect(audiencePage.locator("h1")).toContainText("Menunggu persetujuan Host");

    // Host Approves Audience Device
    await hostPage.bringToFront();
    await expect(hostPage.locator(`text=${audienceDeviceId}`)).toBeVisible({ timeout: 15000 });
    await hostPage.locator('button:has-text("Approve")').first().click();

    // Audience enters approved display surface (shows Menunggu presentasi dimulai)
    await audiencePage.bringToFront();
    await expect(audiencePage.locator("h1")).toContainText("Menunggu presentasi dimulai", { timeout: 10000 });

    // 6. Context D: CONFIDENCE DISPLAY (Joining Room A) - Requires Approval (P0-3)
    const confidenceContext = await browser.newContext();
    const confidenceDeviceId = `dev-conf-e2e-${Date.now()}`;
    await confidenceContext.addInitScript(({ key, val }) => {
      window.localStorage.setItem(key, val);
    }, { key: `stagepilot_dev_id_confidence_${roomCodeA}`, val: confidenceDeviceId });

    const confidencePage = await confidenceContext.newPage();
    await confidencePage.goto(`/display/confidence?roomCode=${roomCodeA}`);

    // Must show Pending Approval before Host approves! (BB-FIX-02)
    await expect(confidencePage.locator("h1")).toContainText("Menunggu persetujuan Host");

    // Host Approves Confidence Device
    await hostPage.bringToFront();
    await expect(hostPage.locator(`text=${confidenceDeviceId}`)).toBeVisible({ timeout: 15000 });
    await hostPage.locator('button:has-text("Approve")').first().click();

    // Confidence enters approved HUD surface
    await confidencePage.bringToFront();
    await expect(confidencePage.locator("text=STAGE COUNTDOWN TIMER")).toBeVisible({ timeout: 10000 });

    // 7. Context B (Guest Control): Send Brief Cue
    await guestPage.bringToFront();
    const briefInput = guestPage.locator('textarea[placeholder*="Send quick cue"]');
    if (await briefInput.isVisible()) {
      await briefInput.fill("Q&A starting in 2 mins");
      await guestPage.click('button:has-text("Send Cue")');
    }

    // 8. Context D (Confidence Display): Verify Show Caller Brief Cue arrives
    await confidencePage.bringToFront();
    await expect(confidencePage.locator("text=Q&A starting in 2 mins")).toBeVisible({ timeout: 10000 });

    // 9. Test Invalid Room URL Direct Access with Friendly Error (BB-FIX-07 / P1-1)
    const invalidPage = await hostContext.newPage();
    await invalidPage.goto("/control?roomCode=NONEXISTENT_ROOM_99");
    await expect(invalidPage.locator("h1")).toContainText("Room tidak ditemukan");

    // Cleanup contexts
    await hostContext.close();
    await guestContext.close();
    await audienceContext.close();
    await confidenceContext.close();
  });
});
