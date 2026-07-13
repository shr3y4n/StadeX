import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Helper to base64 encode auth header if STAFF credentials are set
const authHeader = 'Basic ' + Buffer.from('shreyan:1234').toString('base64');

test.describe('StadeX Golden Path and Accessibility Verification', () => {
  
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  });
  
  test('E2E Golden Path: scan ticket -> congestion -> auto-reroute -> staff alert', async ({ page, context }) => {
    // 1. Visit Fan App
    await page.goto('/');
    await expect(page).toHaveTitle(/StadeX/);

    // 2. Visit Staff Dashboard in a separate tab or page
    const staffPage = await context.newPage();
    staffPage.on('console', msg => console.log('STAFF PAGE LOG:', msg.text()));
    staffPage.on('pageerror', err => console.log('STAFF PAGE ERROR:', err.message));
    await staffPage.goto('/staff/');
    
    // Perform custom UI login
    await staffPage.fill('#login-username', 'shreyan');
    await staffPage.fill('#login-password', '1234');
    await staffPage.click('#form-login-password button[type="submit"]');
    
    await expect(staffPage).toHaveTitle(/StadeX — Control Room/);

    // 3. Trigger Gate B Congestion spike via override API/simulation on staff page
    // We can simulate dragging the occupancy slider by making a POST request or clicking a button
    // Let's call the API directly using page.evaluate to trigger the override securely
    await staffPage.evaluate(async () => {
      const res = await fetch('/api/gate-status/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateId: 'B', occupancy_pct: 99, queue_len_min: 15 })
      });
      console.log('OVERRIDE FETCH STATUS:', res.status);
      if (!res.ok) {
        console.log('OVERRIDE ERROR BODY:', await res.text());
      }
    });

    // Wait for SSE broadcast sync
    await page.waitForTimeout(1000);

    // 4. In the Fan App, click the Ticket scan button to open modal
    await page.click('button[aria-label="Scan Ticket QR code"]');
    
    // Select Section 205 (which recommends entry via congested Gate B, forcing an auto-reroute)
    await page.click('text=Section 205 (East Block)');

    // Verify auto-reroute UI feedback is rendered on the map screen
    const activeRouteText = page.locator('div[role="status"]');
    await expect(activeRouteText).toBeVisible();
    await expect(activeRouteText).toContainText(/Gate [ACDEF]/);
    await expect(activeRouteText).toContainText('rerouted');

    // 5. In Staff Page, verify alert is dispatched and appears in the SLA feed
    const alertFeedItem = staffPage.locator('text=Gate B Critical');
    await expect(alertFeedItem).toBeVisible();

    // Click Resolve on the alert
    await staffPage.click('button[aria-label^="Resolve and clear alert"]');

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
    if (criticalViolations.length > 0) {
      console.log('CRITICAL VIOLATIONS (FAN APP):', JSON.stringify(criticalViolations, null, 2));
    }
    expect(criticalViolations.length).toBe(0);
  });

  test('A11y verification: Run Axe accessibility checks on Staff Dashboard', async ({ page }) => {
    await page.goto('/staff/');
    
    // Perform custom UI login to get inside the dashboard
    await page.fill('#login-username', 'shreyan');
    await page.fill('#login-password', '1234');
    await page.click('#form-login-password button[type="submit"]');
    await expect(page).toHaveTitle(/StadeX — Control Room/);

    // Analyze the page with Axe
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    // Expect no critical accessibility violations
    const criticalViolations = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    if (criticalViolations.length > 0) {
      console.log('CRITICAL VIOLATIONS (STAFF DASHBOARD):', JSON.stringify(criticalViolations, null, 2));
    }
    expect(criticalViolations.length).toBe(0);
  });

  test('A11y verification: Run Axe accessibility checks on Login Page', async ({ page }) => {
    await page.goto('/login');

    // Analyze the page with Axe
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    // Expect no critical accessibility violations
    const criticalViolations = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    if (criticalViolations.length > 0) {
      console.log('CRITICAL VIOLATIONS (LOGIN PAGE):', JSON.stringify(criticalViolations, null, 2));
    }
    expect(criticalViolations.length).toBe(0);
  });
});
