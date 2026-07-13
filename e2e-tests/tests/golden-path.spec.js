import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Helper to base64 encode auth header if STAFF credentials are set
const authHeader = 'Basic ' + Buffer.from('admin:stadex2026').toString('base64');

test.describe('StadeX Golden Path and Accessibility Verification', () => {
  
  test('E2E Golden Path: scan ticket -> congestion -> auto-reroute -> staff alert', async ({ page, context }) => {
    // Set authentication header for staff dashboard requests
    await context.setExtraHTTPHeaders({
      'Authorization': authHeader
    });

    // 1. Visit Fan App
    await page.goto('/');
    await expect(page).toHaveTitle(/StadeX/);

    // 2. Visit Staff Dashboard in a separate tab or page
    const staffPage = await context.newPage();
    await staffPage.goto('/staff/');
    await expect(staffPage).toHaveTitle(/StadeX — Control Room/);

    // 3. Trigger Gate B Congestion spike via override API/simulation on staff page
    // We can simulate dragging the occupancy slider by making a POST request or clicking a button
    // Let's call the API directly using page.evaluate to trigger the override securely
    await staffPage.evaluate(async () => {
      await fetch('/api/gate-status/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateId: 'B', occupancy_pct: 99, queue_len_min: 15 })
      });
    });

    // Wait for SSE broadcast sync
    await page.waitForTimeout(1000);

    // 4. In the Fan App, click the Ticket scan button to open modal
    await page.click('button[aria-label="Scan Ticket QR code"]');
    
    // Select Section 205 (which recommends entry via congested Gate B, forcing an auto-reroute)
    await page.click('text=Gate B (Section 205 - Low Wait)');

    // Verify auto-reroute UI feedback is rendered on the map screen
    const activeRouteText = page.locator('text=Active Route:');
    await expect(activeRouteText).toBeVisible();
    await expect(activeRouteText).toContainText('Gate C');
    await expect(activeRouteText).toContainText('rerouted');

    // 5. In Staff Page, verify alert is dispatched and appears in the SLA feed
    const alertFeedItem = staffPage.locator('text=Gate B Incident');
    await expect(alertFeedItem).toBeVisible();

    // Click Resolve on the alert
    await staffPage.click('text=Resolve');

    // Verify alert is cleared
    await expect(alertFeedItem).not.toBeVisible();
  });

  test('A11y verification: Run Axe accessibility checks on Fan App', async ({ page }) => {
    await page.goto('/');
    
    // Analyze the page with Axe
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    // Expect no critical accessibility violations
    const criticalViolations = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(criticalViolations.length).toBe(0);
  });

  test('A11y verification: Run Axe accessibility checks on Staff Dashboard', async ({ page, context }) => {
    await context.setExtraHTTPHeaders({
      'Authorization': authHeader
    });
    
    await page.goto('/staff/');

    // Analyze the page with Axe
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    // Expect no critical accessibility violations
    const criticalViolations = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(criticalViolations.length).toBe(0);
  });
});
