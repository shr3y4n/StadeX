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

let statusListeners = [];

export const onStatusUpdate = (cb) => {
  statusListeners.push(cb);
};

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

        // Calculate predictions (Feature 1: Queue Prediction Engine)
        const trend = gate.occupancy_pct > 50 ? 1 : -1;
        gate.predicted_15m = Math.max(10, Math.min(99, Math.round(gate.occupancy_pct + (trend * (Math.floor(Math.random() * 8) + 2)))));
        gate.predicted_30m = Math.max(10, Math.min(99, Math.round(gate.predicted_15m + (trend * (Math.floor(Math.random() * 10) + 3)))));

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

      // Notify all active status update listeners (SSE stream)
      statusListeners.forEach(cb => cb(status));

    } catch (error) {
      console.error('[Simulator Error]:', error);
    }
  }, 5000); // every 5 seconds
};

export const overrideGateStatus = (gateId, occupancy, queueLen) => {
  try {
    if (!fs.existsSync(STATUS_PATH)) return false;
    const data = fs.readFileSync(STATUS_PATH, 'utf8');
    const status = JSON.parse(data);
    if (status[gateId]) {
      status[gateId].occupancy_pct = occupancy;
      status[gateId].queue_len_min = queueLen;
      
      const trend = occupancy > 50 ? 1 : -1;
      status[gateId].predicted_15m = Math.max(10, Math.min(99, Math.round(occupancy + (trend * 5))));
      status[gateId].predicted_30m = Math.max(10, Math.min(99, Math.round(status[gateId].predicted_15m + (trend * 8))));
      
      fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), 'utf8');
      
      // If critical threshold reached, trigger immediate alert generation (bypass 5s poll lag for E2E tests)
      if (occupancy >= 85) {
        if (!alerts.some(a => a.gateId === gateId && !a.resolved)) {
          generateStaffAlert(gateId, occupancy, queueLen).then(alertText => {
            alerts.push({
              id: Date.now() + Math.random(),
              gateId,
              message: alertText,
              timestamp: new Date().toISOString(),
              resolved: false
            });
          }).catch(err => {
            console.error('Failed to generate staff alert instantly:', err);
          });
        }
      }

      // Notify all status update listeners (SSE stream)
      statusListeners.forEach(cb => cb(status));
      return true;
    }
  } catch (error) {
    console.error('[Simulator Override Error]:', error);
  }
  return false;
};
