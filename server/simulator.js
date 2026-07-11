import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateStaffAlert } from './orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATUS_PATH = path.join(__dirname, '../shared/data/gateStatus.json');

// In-memory active alerts array
let alerts = [
  {
    id: 'initial-alert-1',
    gateId: 'B',
    message: 'Gate B is at 88% occupancy. Metro queue bottleneck forming. Recommend directing arrivals to Gate C.',
    timestamp: new Date(Date.now() - 60000).toISOString(),
    resolved: false
  }
];

export const getAlerts = () => {
  return alerts.filter(a => !a.resolved);
};

export const resolveAlert = (alertId) => {
  const alert = alerts.find(a => a.id === alertId);
  if (alert) {
    alert.resolved = true;
    console.log(`[Simulator] Resolved alert: ${alertId}`);
    return true;
  }
  return false;
};

export const startSimulator = () => {
  console.log('[Simulator] Starting live occupancy and queue simulation...');

  setInterval(async () => {
    try {
      if (!fs.existsSync(STATUS_PATH)) return;

      const data = fs.readFileSync(STATUS_PATH, 'utf8');
      const status = JSON.parse(data);

      // Randomly walk statuses
      for (const gateId of Object.keys(status)) {
        const gate = status[gateId];

        // Walk occupancy % (+/- 3%)
        const delta = Math.floor(Math.random() * 7) - 3; // -3 to +3
        gate.occupancy_pct = Math.max(10, Math.min(99, gate.occupancy_pct + delta));

        // Adjust queue length based on occupancy with minor variance
        const expectedQueue = Math.max(1, Math.round(gate.occupancy_pct / 8));
        const queueDelta = Math.floor(Math.random() * 3) - 1; // -1 to +1
        gate.queue_len_min = Math.max(1, expectedQueue + queueDelta);

        // Check if alert threshold is crossed (85%)
        if (gate.occupancy_pct >= 85) {
          const hasActiveAlert = alerts.some(a => a.gateId === gateId && !a.resolved);
          if (!hasActiveAlert) {
            console.log(`[Simulator] Threshold crossed at Gate ${gateId} (${gate.occupancy_pct}%). Generating AI alert...`);
            
            // Generate alert using Crowd Agent
            const alertText = await generateStaffAlert(gateId, gate.occupancy_pct, gate.queue_len_min);
            
            alerts.unshift({
              id: `alert-${gateId}-${Date.now()}`,
              gateId,
              message: alertText,
              timestamp: new Date().toISOString(),
              resolved: false
            });
          }
        }
      }

      // Write changes back to gateStatus.json
      fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), 'utf8');
      console.log('[Simulator] Updated gateStatus.json successfully.');

    } catch (error) {
      console.error('[Simulator Error]:', error);
    }
  }, 5000); // every 5 seconds
};
