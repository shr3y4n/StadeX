import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { processMessage } from './orchestrator.js';
import { startSimulator, getAlerts, resolveAlert } from './simulator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../shared/data');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
// 1. Chat endpoint
app.post('/api/chat', async (req, res) => {
  const { message, role = 'fan', language } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message field is required.' });
  }

  console.log(`[API] Received chat message from ${role}: "${message}"`);
  
  try {
    const result = await processMessage({ message, role, language });
    res.json(result);
  } catch (error) {
    console.error('[API Error in /api/chat]:', error);
    res.status(500).json({ error: 'Internal server error while routing chat.' });
  }
});

// 2. Staff Alerts endpoint (GET active alerts)
app.get('/api/staff-alerts', (req, res) => {
  try {
    const activeAlerts = getAlerts();
    res.json(activeAlerts);
  } catch (error) {
    console.error('[API Error in GET /api/staff-alerts]:', error);
    res.status(500).json({ error: 'Failed to retrieve active alerts.' });
  }
});

// 3. Staff Alerts Resolve endpoint (POST resolve alert)
app.post('/api/staff-alerts/resolve', (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Alert ID is required to resolve.' });
  }

  try {
    const success = resolveAlert(id);
    if (success) {
      res.json({ success: true, message: `Alert ${id} marked as resolved.` });
    } else {
      res.status(404).json({ error: `Alert ${id} not found or already resolved.` });
    }
  } catch (error) {
    console.error('[API Error in POST /api/staff-alerts/resolve]:', error);
    res.status(500).json({ error: 'Failed to resolve alert.' });
  }
});

// 4. Live gate statuses endpoint (GET status)
app.get('/api/gate-status', (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, 'gateStatus.json');
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'gateStatus.json file not found.' });
    }
    const rawData = fs.readFileSync(filePath, 'utf8');
    const status = JSON.parse(rawData);
    res.json(status);
  } catch (error) {
    console.error('[API Error in GET /api/gate-status]:', error);
    res.status(500).json({ error: 'Failed to read gateStatus.json.' });
  }
});

// Serve static frontend builds in production if they exist
const FAN_DIST = path.join(__dirname, '../fan-app/dist');
const STAFF_DIST = path.join(__dirname, '../staff-dashboard/dist');

if (fs.existsSync(STAFF_DIST)) {
  app.use('/staff', express.static(STAFF_DIST));
  app.get('/staff/*', (req, res) => {
    res.sendFile(path.join(STAFF_DIST, 'index.html'));
  });
}

if (fs.existsSync(FAN_DIST)) {
  app.use('/', express.static(FAN_DIST));
  app.get('/*', (req, res) => {
    res.sendFile(path.join(FAN_DIST, 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`StadeX backend running on http://localhost:${PORT}`);
  
  // Start simulation loop
  startSimulator();
});
