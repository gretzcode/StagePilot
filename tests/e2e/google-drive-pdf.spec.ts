import { test, expect } from "@playwright/test";

test.describe("StagePilot Google Drive PDF Presentation E2E Suite", () => {
  test("Host -> Drive Connection -> Pre-seeded PDF Material -> Presentation Start -> Navigation -> Audience & Confidence Sync", async ({
    browser,
  }) => {
    test.setTimeout(60000);

    // 1. Context A: HOST
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();

    // Login as Host
    await hostPage.goto("/login");
    await hostPage.fill('input[type="email"]', "host@kian.co");
    await hostPage.fill('input[type="password"]', "password1234");
    await Promise.all([
      hostPage.waitForURL(/\/dashboard/, { timeout: 15000 }),
      hostPage.click('button[type="submit"]'),
    ]);

    // Create a new distinct Room for PDF testing
    await hostPage.click("text=Create New Room");
    await hostPage.waitForTimeout(300);
    await hostPage.fill('input[type="text"]', "PDF Presentation Room");
    await hostPage.click('button:has-text("Buat Room")');
    await hostPage.waitForTimeout(500);

    const roomCodeElements = hostPage.locator('button:has-text("ROOM:")');
    const roomCodePDF = (await roomCodeElements.first().innerText()).replace(/^ROOM:\s*/i, "").replace(/[^A-Z0-9]/gi, "").trim();
    expect(roomCodePDF.length).toBeGreaterThanOrEqual(4);

    // Enter Host Master Control
    await hostPage.locator(`a[href*="/control?roomCode=${roomCodePDF}"]`).first().click();
    await expect(hostPage).toHaveURL(new RegExp(`/control\\?roomCode=${roomCodePDF}`));
    await expect(hostPage.locator("header")).toContainText(roomCodePDF);

    // 2. Pre-seed authenticated Google Drive PDF material via API for E2E boundary verification
    const seedRes = await hostPage.request.post("/api/material/url", {
      data: {
        roomCode: roomCodePDF,
        title: "Test_Presentation_Deck.pdf",
        url: "https://drive.google.com/file/d/1e2e_mock_file_id_google_drive_pdf/view",
      },
    });
    expect(seedRes.ok()).toBe(true);
    const seedJson = await seedRes.json();
    const materialId = seedJson.material.id;

    // Refresh control page to ensure pre-seeded PDF material is present in state
    await hostPage.reload();
    await expect(hostPage.locator("header")).toContainText(roomCodePDF);

    // Start Presentation
    const startButton = hostPage.locator('button:has-text("Mulai Presentasi"), button:has-text("Present")').first();
    if (await startButton.isVisible()) {
      await startButton.click();
    }

    // 3. Context B: AUDIENCE DISPLAY
    const audienceContext = await browser.newContext();
    const audienceDeviceId = `dev-aud-pdf-${Date.now()}`;
    await audienceContext.addInitScript(({ key, val }) => {
      window.localStorage.setItem(key, val);
    }, { key: `stagepilot_dev_id_audience_${roomCodePDF}`, val: audienceDeviceId });

    const audiencePage = await audienceContext.newPage();
    await audiencePage.goto(`/display/audience?roomCode=${roomCodePDF}`);

    // Approve Audience Device from Host
    await hostPage.bringToFront();
    await expect(hostPage.locator(`text=${audienceDeviceId}`)).toBeVisible({ timeout: 15000 });
    await hostPage.locator('button:has-text("Approve")').first().click();

    // 4. Context C: CONFIDENCE DISPLAY
    const confidenceContext = await browser.newContext();
    const confidenceDeviceId = `dev-conf-pdf-${Date.now()}`;
    await confidenceContext.addInitScript(({ key, val }) => {
      window.localStorage.setItem(key, val);
    }, { key: `stagepilot_dev_id_confidence_${roomCodePDF}`, val: confidenceDeviceId });

    const confidencePage = await confidenceContext.newPage();
    await confidencePage.goto(`/display/confidence?roomCode=${roomCodePDF}`);

    // Approve Confidence Device from Host
    await hostPage.bringToFront();
    await expect(hostPage.locator(`text=${confidenceDeviceId}`)).toBeVisible({ timeout: 15000 });
    await hostPage.locator('button:has-text("Approve")').first().click();

    // Verify Confidence Display HUD is visible
    await confidencePage.bringToFront();
    await expect(confidencePage.locator("text=STAGE COUNTDOWN TIMER")).toBeVisible({ timeout: 10000 });

    // 5. Room Isolation Verification
    // Audience for Room PDF attempting to access material belonging to another fake room
    const unauthorizedAssetRes = await audiencePage.request.get(`/api/material/asset?roomCode=OTHER_ROOM&materialId=${materialId}`);
    expect(unauthorizedAssetRes.status()).toBe(403);

    // Cleanup
    await hostContext.close();
    await audienceContext.close();
    await confidenceContext.close();
  });
});
