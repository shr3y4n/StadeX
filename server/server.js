import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { processMessage } from './orchestrator.js';
import { startSimulator, getAlerts, resolveAlert, onStatusUpdate } from './simulator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../shared/data');

const app = express();
const PORT = process.env.PORT || 3001;

// 1. Basic Security Settings
app.disable('x-powered-by'); // Disable standard header to obscure server technology
app.use(helmet({
  contentSecurityPolicy: false // Disabled only to allow external Google Fonts link tag on client apps
}));

// 2. Rate Limiting for API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in standard headers
  legacyHeaders: false, // Disable legacy headers
  message: { error: 'Too many requests from this IP, please try again after 15 minutes.' }
});
app.use('/api/', apiLimiter);

// 3. CORS configuration (allowing local React servers and self-domain)
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'https://stadex.onrender.com'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Input sanitizer middleware
const sanitizeInput = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        // Strip HTML tag brackets to prevent raw tag injections
        req.body[key] = req.body[key].replace(/[<>]/g, '');
      }
    }
  }
  next();
};
app.use(sanitizeInput);

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

// 5. SSE Gate Status Stream (Real-Time push)
let sseClients = [];

app.get('/api/gate-status/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial data immediately upon connection
  try {
    const filePath = path.join(DATA_DIR, 'gateStatus.json');
    if (fs.existsSync(filePath)) {
      const rawData = fs.readFileSync(filePath, 'utf8');
      res.write(`data: ${rawData}\n\n`);
    }
  } catch (err) {
    console.error('[SSE] Initial state send error:', err);
  }

  sseClients.push(res);
  console.log(`[SSE] Client connected. Total clients: ${sseClients.length}`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
    console.log(`[SSE] Client disconnected. Total clients: ${sseClients.length}`);
  });
});

// Broadcast changes from simulator to all connected SSE clients
onStatusUpdate((status) => {
  sseClients.forEach(client => {
    try {
      client.write(`data: ${JSON.stringify(status)}\n\n`);
    } catch (e) {
      console.error('[SSE] Error writing data to client:', e.message);
    }
  });
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
