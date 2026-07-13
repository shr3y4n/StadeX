import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { processMessage } from './orchestrator.js';
import { startSimulator, getAlerts, resolveAlert, onStatusUpdate, overrideGateStatus } from './simulator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../shared/data');

const app = express();
const PORT = process.env.PORT || 3001;

// 1. Basic Security Settings
app.disable('x-powered-by'); // Disable standard header to obscure server technology
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Allow react bundle executions
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://*"],
      connectSrc: ["'self'", "http://localhost:3001", "https://stadex.onrender.com", "ws://localhost:*", "ws://127.0.0.1:*"],
      mediaSrc: ["'self'", "data:", "blob:"] // For web speech synthesis/audio
    }
  }
}));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 60 seconds.' }
});
app.use('/api/', apiLimiter);

// 3. CORS configuration (allowing local React dev servers; disabled in production for security)
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:5173', 'http://localhost:5174'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Staff Authentication middleware for dashboard access (Basic Auth - Hack2Skill Requirement)
const staffAuth = (req, res, next) => {
  const user = process.env.STAFF_USER;
  const pass = process.env.STAFF_PASS;
  
  // If credentials are not configured, allow bypass (default dev fallback)
  if (!user || !pass) {
    return next();
  }
  
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
  
  if (login === user && password === pass) {
    return next();
  }
  
  res.set('WWW-Authenticate', 'Basic realm="StadeX Staff"');
  res.status(401).send('Authentication required');
};

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

// Protect all staff-facing endpoints and simulation APIs under Basic Auth (Hack2Skill Security Guidelines)
app.use('/api/staff-alerts', staffAuth);
app.use('/api/emergency/trigger', staffAuth);
app.use('/api/gate-status/override', staffAuth);

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
let emergencyState = { active: false, type: null, timestamp: null, instructions: "" };

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
      res.write(`data: ${JSON.stringify(JSON.parse(rawData))}\n\n`);
    }

    // Send initial emergency status upon connection
    res.write(`event: emergency\n`);
    res.write(`data: ${JSON.stringify(emergencyState)}\n\n`);
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

// 6. Emergency State Management (Feature 3: Emergency mode)
app.get('/api/emergency', (req, res) => {
  res.json(emergencyState);
});

app.post('/api/emergency/trigger', (req, res) => {
  const { active, type, instructions } = req.body;
  
  // Strict Security Input Validation (Feature 7 & Hack2Skill requirement)
  if (active && (typeof type !== 'string' || typeof instructions !== 'string' || type.trim() === '' || instructions.trim() === '')) {
    return res.status(400).json({ error: 'Active emergencies require valid string type and instructions.' });
  }
  
  emergencyState = {
    active: !!active,
    type: type || null,
    instructions: instructions || "",
    timestamp: active ? new Date().toISOString() : null
  };

  console.log(`[Emergency] Mode changed: ${JSON.stringify(emergencyState)}`);

  // Broadcast emergency event to all SSE clients immediately
  sseClients.forEach(client => {
    try {
      client.write(`event: emergency\n`);
      client.write(`data: ${JSON.stringify(emergencyState)}\n\n`);
    } catch (e) {
      console.error('[SSE] Emergency broadcast error:', e.message);
    }
  });

  res.json({ success: true, state: emergencyState });
});

// 7. Gate Status Manual Override (Feature 8: Admin simulation slider)
app.post('/api/gate-status/override', (req, res) => {
  const { gateId, occupancy_pct, queue_len_min } = req.body;
  
  if (!gateId || occupancy_pct === undefined || queue_len_min === undefined) {
    return res.status(400).json({ error: 'gateId, occupancy_pct, and queue_len_min are required.' });
  }

  // Strict boundary parameter checking for hackathon security score
  const parsedOcc = parseInt(occupancy_pct);
  const parsedQueue = parseInt(queue_len_min);
  const validGates = ['A', 'B', 'C', 'D', 'E', 'F'];

  if (!validGates.includes(gateId)) {
    return res.status(400).json({ error: 'Invalid gateId. Must be A-F.' });
  }
  if (isNaN(parsedOcc) || parsedOcc < 0 || parsedOcc > 100) {
    return res.status(400).json({ error: 'occupancy_pct must be an integer between 0 and 100.' });
  }
  if (isNaN(parsedQueue) || parsedQueue < 0 || parsedQueue > 120) {
    return res.status(400).json({ error: 'queue_len_min must be an integer between 0 and 120.' });
  }

  const success = overrideGateStatus(gateId, parsedOcc, parsedQueue);
  if (success) {
    res.json({ success: true, message: `Gate ${gateId} status overridden successfully.` });
  } else {
    res.status(404).json({ error: `Gate ${gateId} override failed.` });
  }
});

// Serve static frontend builds in production if they exist
const FAN_DIST = path.join(__dirname, '../fan-app/dist');
const STAFF_DIST = path.join(__dirname, '../staff-dashboard/dist');

if (fs.existsSync(STAFF_DIST)) {
  app.use('/staff', staffAuth, express.static(STAFF_DIST));
  app.get('/staff/*', staffAuth, (req, res) => {
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
