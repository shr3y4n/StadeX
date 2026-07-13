import test from 'node:test';
import assert from 'node:assert';
import { getAlerts, resolveAlert, overrideGateStatus } from '../simulator.js';

test('Simulator Alert Management tests', async (t) => {

  await t.test('gets active alerts', () => {
    const activeAlerts = getAlerts();
    assert.ok(Array.isArray(activeAlerts));
  });

  await t.test('resolves alert and removes it from active list', () => {
    const activeAlertsBefore = getAlerts();
    if (activeAlertsBefore.length > 0) {
      const targetAlertId = activeAlertsBefore[0].id;
      const success = resolveAlert(targetAlertId);
      assert.strictEqual(success, true);
      
      const activeAlertsAfter = getAlerts();
      const isStillActive = activeAlertsAfter.some(a => a.id === targetAlertId);
      assert.strictEqual(isStillActive, false);
    }
  });

  await t.test('returns false for resolving non-existent alert ID', () => {
    const success = resolveAlert('non-existent-id-xyz');
    assert.strictEqual(success, false);
  });

  await t.test('updates gate status override successfully for valid gate', () => {
    const success = overrideGateStatus('A', 80, 15);
    assert.strictEqual(success, true);
  });

  await t.test('returns false for invalid gate ID override', () => {
    const success = overrideGateStatus('Z', 80, 15);
    assert.strictEqual(success, false);
  });
});
