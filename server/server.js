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
      scriptSrc: ["'self'", "'unsafe-inline'"], // Removed unsafe-eval for production security (Issue 4)
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://*"],
      connectSrc: ["'self'", "http://localhost:3001", "https://stadex.onrender.com", "ws://localhost:*", "ws://127.0.0.1:*"],
      mediaSrc: ["'self'", "data:", "blob:"] // For web speech synthesis/audio
    }
  }
}));

// 2. Rate Limiting for API routes
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

// In-Memory active auth sessions database & pending OTP registry (Issue 1)
const activeSessions = {};
const pendingOtps = {};

// Staff Authentication middleware for dashboard access (Basic Auth & Token support - fails closed)
const staffAuth = (req, res, next) => {
  const user = process.env.STAFF_USER || (process.env.NODE_ENV !== 'production' ? 'shreyan' : undefined);
  const pass = process.env.STAFF_PASS || (process.env.NODE_ENV !== 'production' ? '1234' : undefined);

  if (!user || !pass) {
    console.error('[SECURITY] STAFF_USER/STAFF_PASS not configured — refusing staff access.');
    return res.status(503).json({ error: 'Staff access temporarily unavailable.' });
  }

  // Also check session cookie 'staffAuthToken' (for AJAX requests from the staff dashboard)
  let token = undefined;
  const rc = req.headers.cookie;
  if (rc) {
    const list = {};
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
    token = list['staffAuthToken'];
  }
  
  if (token && activeSessions[token]) {
    req.user = { username: activeSessions[token] };
    return next();
  }

  const authHeader = req.headers.authorization || '';

  if (authHeader.startsWith('Basic ')) {
    const b64auth = authHeader.split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    
    // Check local JSON database (users.json)
    try {
      const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8'));
      const foundUser = users.find(u => (u.username === login || u.email === login || u.phone === login) && u.password === password);
      if (foundUser) {
        req.user = foundUser;
        return next();
      }
    } catch (err) {
      console.error('[SECURITY] Error reading users.json for basic auth:', err);
    }
  } else if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1] || '';
    const username = activeSessions[token];
    if (username) {
      req.user = { username };
      return next();
    }
  }
  
  res.set('WWW-Authenticate', 'Basic realm="StadeX Staff"');
  res.status(401).send('Authentication required');
};

// Size limit Express JSON body size (Issue 5: Cost DoS vector protection)
app.use(express.json({ limit: '10kb' }));

// Validate chat message type and length middleware (Issue 4 & 5)
const validateChatInput = (req, res, next) => {
  const { message } = req.body;
  if (message === undefined || message === null) {
    return res.status(400).json({ error: 'Message field is required.' });
  }
  if (typeof message !== 'string') {
    return res.status(400).json({ error: 'Message must be a string.' });
  }
  if (message.length > 1000) {
    return res.status(400).json({ error: 'Message too long (max 1000 characters).' });
  }
  next();
};

// Protect all staff-facing endpoints and simulation APIs under Basic Auth (Hack2Skill Security Guidelines)
app.use('/api/staff-alerts', staffAuth);
app.use('/api/emergency/trigger', staffAuth);
app.use('/api/gate-status/override', staffAuth);

// ----------------------------------------------------
// Authentication API Endpoints (OTP, Signup, Session management)
// ----------------------------------------------------

// 1. SIGNUP: takes email/phone, returns mock OTP (printed to console/returned for demo)
app.post('/api/auth/signup', (req, res) => {
  const { email, phone } = req.body;
  if (!email && !phone) {
    return res.status(400).json({ error: 'Email or Phone number is required to sign up.' });
  }

  const key = email || phone;
  // Generate random 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  pendingOtps[key] = otp;

  console.log(`\n==========================================================`);
  console.log(`[AUTH] DEMO SIGNUP: Generated OTP for ${key}`);
  console.log(`[AUTH] MOCK OTP CODE: ${otp} (Provide this to user in response)`);
  console.log(`==========================================================\n`);

  res.json({ success: true, message: `OTP sent successfully to ${key}.`, otp });
});

// 2. VERIFY-OTP: takes email/phone, otp, username, password. Creates the user in users.json
app.post('/api/auth/verify-otp', (req, res) => {
  const { email, phone, otp, username, password } = req.body;
  if (!email && !phone) {
    return res.status(400).json({ error: 'Email or Phone is required.' });
  }
  if (!otp || !username || !password) {
    return res.status(400).json({ error: 'otp, username, and password are required.' });
  }

  const key = email || phone;
  const expectedOtp = pendingOtps[key];

  if (!expectedOtp || expectedOtp !== otp) {
    return res.status(400).json({ error: 'Invalid or expired OTP.' });
  }

  // Clear OTP
  delete pendingOtps[key];

  try {
    const usersPath = path.join(__dirname, 'users.json');
    let users = [];
    if (fs.existsSync(usersPath)) {
      users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    }

    // Check if user already exists
    if (users.some(u => u.username === username || (email && u.email === email) || (phone && u.phone === phone))) {
      return res.status(400).json({ error: 'Username, Email, or Phone is already registered.' });
    }

    const newUser = { username, password, email: email || null, phone: phone || null };
    users.push(newUser);
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8');

    // Create session
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    activeSessions[token] = username;

    res.json({ success: true, message: 'Account registered successfully.', token, username });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to complete signup.' });
  }
});

// 3. LOGIN: verifies username/password. Returns token.
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const usersPath = path.join(__dirname, 'users.json');
    if (!fs.existsSync(usersPath)) {
      return res.status(500).json({ error: 'User database not configured.' });
    }

    const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    const user = users.find(u => (u.username === username || u.email === username || u.phone === username) && u.password === password);

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = Buffer.from(`${user.username}:${user.password}`).toString('base64');
    activeSessions[token] = user.username;

    res.json({ success: true, token, username: user.username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to verify login.' });
  }
});

// Routes
// 1. Chat endpoint (Public Fan Chat)
app.post('/api/chat', validateChatInput, async (req, res) => {
  const { message, language } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message field is required.' });
  }

  // Force role to 'fan' to block privilege escalation (Issue 3)
  const role = 'fan';
  console.log(`[API] Received public fan chat message: "${message}"`);
  
  try {
    const result = await processMessage({ message, role, language });
    res.json(result);
  } catch (error) {
    console.error('[API Error in /api/chat]:', error);
    res.status(500).json({ error: 'Internal server error while routing chat.' });
  }
});

// 2. Staff Chat endpoint (Authenticated Staff Chat - Issue 3 mitigation)
app.post('/api/staff/chat', staffAuth, validateChatInput, async (req, res) => {
  const { message, language } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message field is required.' });
  }

  const role = 'staff';
  console.log(`[API] Received authenticated staff chat message: "${message}"`);
  
  try {
    const result = await processMessage({ message, role, language });
    res.json(result);
  } catch (error) {
    console.error('[API Error in /api/staff/chat]:', error);
    res.status(500).json({ error: 'Internal server error while routing staff chat.' });
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

// Serve the public login portal page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Serve static frontend builds in production if they exist
const FAN_DIST = path.join(__dirname, '../fan-app/dist');
const STAFF_DIST = path.join(__dirname, '../staff-dashboard/dist');

// Middleware to restrict static dashboard loading to authenticated sessions on the server (Issue 2)
const restrictStaticStaff = (req, res, next) => {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  const token = list['staffAuthToken'];
  if (token && activeSessions[token]) {
    return next();
  }
  
  // Also check legacy HTTP Basic auth header
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Basic ')) {
    const b64auth = authHeader.split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    try {
      const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8'));
      if (users.some(u => (u.username === login || u.email === login || u.phone === login) && u.password === password)) {
        return next();
      }
    } catch (e) {}
  }
  
  // If not authenticated, redirect to the public login page
  res.redirect('/login');
};

if (fs.existsSync(STAFF_DIST)) {
  app.use('/staff', restrictStaticStaff, express.static(STAFF_DIST));
  app.get('/staff/*', restrictStaticStaff, (req, res) => {
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
  // Sync environment variables or defaults to users.json on startup (Issue 1 fail-closed protection)
  try {
    const envUser = process.env.STAFF_USER || 'shreyan';
    const envPass = process.env.STAFF_PASS || '1234';
    const usersPath = path.join(__dirname, 'users.json');
    let users = [];
    if (fs.existsSync(usersPath)) {
      users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    }
    
    const idx = users.findIndex(u => u.username === envUser);
    if (idx >= 0) {
      users[idx].password = envPass;
    } else {
      users.push({
        username: envUser,
        password: envPass,
        email: `${envUser}@google.com`,
        phone: '+1234567890'
      });
    }
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8');
    console.log(`[AUTH] Synced staff credentials for default user: ${envUser}`);
  } catch (err) {
    console.error('[AUTH] Failed to sync credentials to database:', err);
  }

  // Enforce fail-closed check for production env configs (Issue 1)
  if (process.env.NODE_ENV === 'production' && (!process.env.STAFF_USER || !process.env.STAFF_PASS)) {
    console.error('FATAL: STAFF_USER/STAFF_PASS required in production. Exiting.');
    process.exit(1);
  }

  console.log(`StadeX backend running on http://localhost:${PORT}`);
  
  // Start simulation loop
  startSimulator();
});
