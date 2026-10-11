const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '.env') });
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const { GrabEngine } = require('./grabEngine');
const workspace = require('./workspace');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

function serverError(res, err) {
  console.error(err);
  const message = err && err.message ? String(err.message) : 'Something went wrong. Please try again.';
  const isClient =
    /validation|required|duplicate|cast/i.test(message) ||
    err?.name === 'ValidationError' ||
    err?.name === 'CastError';
  return res.status(isClient ? 400 : 500).json({
    error: isClient ? message : 'Something went wrong. Please try again.',
  });
}

// Default task limit (no longer using coupon system)
const DEFAULT_TASK_LIMIT = 3;

// Resolve task limit by capping requested count to the user's allowed limit
function resolveTaskLimit(requested, limit) {
  const maxLimit = Math.max(1, Number(limit) || DEFAULT_TASK_LIMIT);
  const want = Math.max(1, Number(requested) || maxLimit);
  return Math.min(want, maxLimit);
}

const app = express();
const PORT = process.env.PORT || 5000;

mongoose.set('strictQuery', true);

app.disable('x-powered-by');
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

// ──────────────────────────────────────────────────────────────
// Schemas
// ──────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: false, default: null },
  password: { type: String, required: false, default: null, select: false },
  fullName: String,
  state: String,
  credits: { type: Number, default: 5 },
  emailConfirmedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  // Plan + task limits
  plan: { type: String, default: 'Free' },
  taskLimit: { type: Number, default: DEFAULT_TASK_LIMIT },
  // Active service after login: 'incoin' | 'pakkago'
  activeProvider: { type: String, default: null },
  // Incoin service session (token encrypted at rest) — single workspace per user
  incoinUsername: { type: String, index: { unique: true, sparse: true } },
  incoinToken: { type: String },
  incoinTokenIv: { type: String },
  incoinTokenTag: { type: String },
  incoinConnectedAt: { type: Date },
  incoinPhone: { type: String, unique: true, sparse: true, index: true },
  incoinAccountLocked: { type: Boolean, default: false },
  pakkagoUsername: { type: String, index: { unique: true, sparse: true } },
  pakkagoToken: { type: String },
  pakkagoTokenIv: { type: String },
  pakkagoTokenTag: { type: String },
  pakkagoConnectedAt: { type: Date },
  pakkagoPhone: { type: String },
  pakkagoAccountLocked: { type: Boolean, default: false },
  // User preference for tasks per run (1-3, capped by taskLimit)
  tasksPerRun: { type: Number, default: 3, min: 1, max: 3 },
});

const logSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ordersCount: { type: Number, default: 0 },
  creditsUsed: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const referralSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  imageUrls: [String],
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});

const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);
const Log = mongoose.model('TaskLog', logSchema, 'tasklogs');
const Referral = mongoose.model('Referral', referralSchema);
const Device = mongoose.model('Device', deviceSchema);

async function verifyUserPassword(user, password) {
  const hash = user.passwordHash || user.password;
  if (!hash || !password) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// User serialization (safe fields shared with the client)
// ──────────────────────────────────────────────────────────────
function serializeUser(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    fullName: user.fullName,
    state: user.state,
    credits: user.credits,
    emailConfirmedAt: user.emailConfirmedAt,
    plan: user.plan || 'Free',
    taskLimit: user.taskLimit || DEFAULT_TASK_LIMIT,
    tasksPerRun: Math.min(Math.max(1, user.tasksPerRun || 3), user.taskLimit || DEFAULT_TASK_LIMIT),
    activeProvider: user.activeProvider || null,
    incoinUsername: user.incoinUsername || null,
    incoinPhone: user.incoinPhone || null,
    incoinAccountLocked: user.incoinAccountLocked || false,
    pakkagoUsername: user.pakkagoUsername || null,
    pakkagoPhone: user.pakkagoPhone || null,
    pakkagoAccountLocked: user.pakkagoAccountLocked || false,
    services: workspace.summarizeServices(user),
    createdAt: user.createdAt,
  };
}

// ──────────────────────────────────────────────────────────────
// Auth helpers
// ──────────────────────────────────────────────────────────────
function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  if (req.query && req.query.token) return req.query.token;
  return null;
}

function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ──────────────────────────────────────────────────────────────
// Encrypt/decrypt for the stored Incoin session token
// ──────────────────────────────────────────────────────────────
function encryptionKey() {
  return crypto.createHash('sha256').update(JWT_SECRET).digest();
}

function encryptToken(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: data.toString('base64'),
  };
}

function decryptToken(ivB64, tagB64, dataB64) {
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch (err) {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────
// Grab-engine slot management (per user, in memory)
// ──────────────────────────────────────────────────────────────
const engineSlots = new Map();

function getSlot(userId) {
  let slot = engineSlots.get(userId);
  if (!slot) {
    slot = {
      engine: null,
      buffer: [],
      listeners: new Set(),
      running: false,
      progress: 0,
      status: '',
      processed: 0,
    };
    engineSlots.set(userId, slot);
  }
  return slot;
}

function emitToSlot(slot, event) {
  slot.buffer.push(event);
  if (slot.buffer.length > 500) slot.buffer.shift();
  slot.progress = event.progress;
  slot.status = event.status || event.message;
  slot.processed = event.processed;
  const payload = JSON.stringify(event);
  for (const res of [...slot.listeners]) {
    try {
      res.write(`event: progress\ndata: ${payload}\n\n`);
    } catch (err) {
      slot.listeners.delete(res);
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Core API
// ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbOk = dbState === 1;
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    db: dbOk ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected',
  });
});

function requireDb(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Database is temporarily unavailable. Please try again.' });
  }
  next();
}

app.use('/api', requireDb);

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName, state, incoinUsername, incoinPhone } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    // The Account Username / ID accepts the Incoin account number (e.g. 9875641235),
    // which is the mobile number registered with that Incoin account. It is captured
    // once at registration and permanently bound to the registering Gmail account.
    const accountNumber = String(incoinUsername || incoinPhone || '').trim();
    if (!accountNumber) {
      return res.status(400).json({ error: 'Incoin account number (Account Username / ID) is required' });
    }

    // Validate Incoin account number format (Indian mobile: 10 digits, optional +91/91 prefix)
    const phoneRegex = /^(\+91|91)?[6-9]\d{9}$/;
    if (!phoneRegex.test(accountNumber)) {
      return res.status(400).json({ error: 'Invalid Incoin account number. Use Indian mobile format (e.g., +91XXXXXXXXXX or 10 digits)' });
    }

    // Normalize account number: strip +91/91 prefix, keep 10 digits
    const normalizedAccount = accountNumber.replace(/^(\+91|91)/, '');

    const existing = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (existing) return res.status(409).json({ error: 'User already exists' });

    // Permanent binding: the same Incoin account (Account Username / ID) cannot be
    // registered with any other Gmail account.
    const accountExists = await User.findOne({ incoinUsername: normalizedAccount });
    if (accountExists) {
      return res.status(409).json({ error: 'This Incoin account is already registered with another email address' });
    }

    // The phone number associated with the Incoin account cannot be registered
    // with any other Gmail account either.
    const phoneExists = await User.findOne({ incoinPhone: normalizedAccount });
    if (phoneExists) {
      return res.status(409).json({ error: 'This phone number is already registered with another account' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: String(email).trim().toLowerCase(),
      passwordHash,
      fullName: String(fullName || '').trim(),
      state,
      incoinUsername: normalizedAccount,
      incoinPhone: normalizedAccount,
      credits: 25,
      emailConfirmedAt: new Date(),
      plan: 'Free',
      taskLimit: DEFAULT_TASK_LIMIT,
      tasksPerRun: DEFAULT_TASK_LIMIT,
    });

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: serializeUser(user),
    });
  } catch (err) {
    // Handle duplicate key errors for the Incoin account / phone number binding
    if (err.code === 11000 && err.keyPattern) {
      if (err.keyPattern.email) {
        return res.status(409).json({ error: 'User already exists' });
      }
      if (err.keyPattern.incoinUsername) {
        return res.status(409).json({ error: 'This Incoin account is already registered with another email address' });
      }
      if (err.keyPattern.incoinPhone) {
        return res.status(409).json({ error: 'This phone number is already registered with another account' });
      }
    }
    return serverError(res, err);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await User.findOne({ email: String(email).trim().toLowerCase() }).select('+password');
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await verifyUserPassword(user, password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    if (!user.passwordHash && user.password) {
      user.passwordHash = user.password;
      await user.save();
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: serializeUser(user),
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// Current authenticated user's full profile (includes plan/task details for the dashboard).
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      user: serializeUser(user),
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// Update user settings (tasks per run preference)
app.patch('/api/user/settings', authMiddleware, async (req, res) => {
  try {
    const { tasksPerRun } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Validate and cap tasksPerRun to user's task limit
    const taskLimit = user.taskLimit || DEFAULT_TASK_LIMIT;
    let effectiveTasksPerRun = Math.max(1, Math.min(3, Number(tasksPerRun) || 3));
    effectiveTasksPerRun = Math.min(effectiveTasksPerRun, taskLimit);

    user.tasksPerRun = effectiveTasksPerRun;
    await user.save();

    res.json({
      success: true,
      tasksPerRun: effectiveTasksPerRun,
      taskLimit,
    });
  } catch (err) {
    return serverError(res, err);
  }
});

app.get('/api/credits', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json({ balance: user?.credits || 0 });
  } catch (err) {
    return serverError(res, err);
  }
});

app.post('/api/credits/add', authMiddleware, async (req, res) => {
  try {
    const amount = Number(req.body?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
      return res.status(400).json({ error: 'Invalid credit amount' });
    }
    const user = await User.findByIdAndUpdate(req.userId, { $inc: { credits: amount } }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, balance: user.credits });
  } catch (err) {
    return serverError(res, err);
  }
});

app.get('/api/logs', authMiddleware, async (req, res) => {
  try {
    const logs = await Log.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(200);
    res.json({ logs: logs.map(log => ({
      id: log._id.toString(),
      ordersCount: log.ordersCount,
      creditsUsed: log.creditsUsed,
      createdAt: log.createdAt,
    })) });
  } catch (err) {
    return serverError(res, err);
  }
});

app.post('/api/logs', authMiddleware, async (req, res) => {
  try {
    const { tasksCount, creditsUsed } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const used = Math.max(0, Number(creditsUsed || 0));
    const orders = Math.max(0, Number(tasksCount || 0));
    if (used > 0 && user.credits > 0) {
      const deduct = Math.min(used, user.credits);
      await User.findByIdAndUpdate(req.userId, { $inc: { credits: -deduct } });
    }

    const log = await Log.create({
      userId: req.userId,
      ordersCount: orders,
      creditsUsed: used,
    });

    res.json({
      success: true,
      log: {
        id: log._id.toString(),
        ordersCount: log.ordersCount,
        creditsUsed: log.creditsUsed,
        createdAt: log.createdAt,
      },
    });
  } catch (err) {
    return serverError(res, err);
  }
});

app.get('/api/referrals/status', authMiddleware, async (req, res) => {
  try {
    const referral = await Referral.findOne({ userId: req.userId });
    res.json({ hasApplied: !!referral });
  } catch (err) {
    return serverError(res, err);
  }
});

app.post('/api/referrals/apply', authMiddleware, async (req, res) => {
  try {
    const { imageUrls, status } = req.body;
    await Referral.create({ userId: req.userId, imageUrls, status: status || 'pending' });
    res.json({ success: true });
  } catch (err) {
    return serverError(res, err);
  }
});

app.post('/api/uploads/referral', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
  } catch (err) {
    return serverError(res, err);
  }
});

app.get('/uploads/:filename', (req, res) => {
  const safeName = path.basename(String(req.params.filename || ''));
  if (!safeName || safeName !== req.params.filename) return res.status(400).send('Invalid filename');
  const filePath = path.join(uploadDir, safeName);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

app.get('/api/devices/registered/:deviceId', async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId });
    res.json({ registered: !!device });
  } catch (err) {
    return serverError(res, err);
  }
});

app.post('/api/devices/register', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
    await Device.findOneAndUpdate(
      { deviceId },
      { $set: { deviceId, userId: req.userId } },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    return serverError(res, err);
  }
});

// ──────────────────────────────────────────────────────────────
// Incoin engine API
// ──────────────────────────────────────────────────────────────

// Fetch a captcha image for the connect flow.
app.get('/api/workspace/services', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      activeProvider: user.activeProvider || null,
      services: workspace.summarizeServices(user),
    });
  } catch (err) {
    return serverError(res, err);
  }
});

app.post('/api/workspace/select', authMiddleware, async (req, res) => {
  try {
    const provider = workspace.normalizeProvider(req.body?.provider);
    if (!provider) return res.status(400).json({ error: 'Choose Incoin or PakkaGo.' });
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.activeProvider = provider;
    await user.save();
    const ws = workspace.readWorkspace(user, provider);
    res.json({
      success: true,
      provider,
      connected: ws.connected,
      username: ws.username,
      phone: ws.phone,
      services: workspace.summarizeServices(user),
    });
  } catch (err) {
    return serverError(res, err);
  }
});

function resolveRequestProvider(req, user) {
  return workspace.normalizeProvider(req.query?.provider || req.body?.provider) || user.activeProvider || 'incoin';
}

app.get('/api/incoin/captcha', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const provider = resolveRequestProvider(req, user);
    const meta = workspace.getMeta(provider);
    const client = workspace.getClient(provider);
    const captcha = await client.fetchCaptcha();
    if (!captcha) {
      return res.status(502).json({
        error: `Could not load captcha from ${meta.name}. The service did not return an image. Try again.`,
      });
    }
    res.json({ captchaToken: captcha.token, imageBase64: captcha.imageBase64, provider });
  } catch (err) {
    return serverError(res, err);
  }
});

// Validate Incoin credentials via captcha + login, then store the session.
// Phone number binding: the Incoin account number / phone is permanently bound at
// registration and is NOT re-verified against the Incoin API here. The account is
// locked after the first successful connection.
app.post('/api/incoin/connect', authMiddleware, async (req, res) => {
  try {
    const { username, password, captchaCode, captchaToken, authToken } = req.body;
    if (!username || (!authToken && !password)) {
      return res.json({ success: false, error: 'Username and password required.' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const provider = resolveRequestProvider(req, user);
    const meta = workspace.getMeta(provider);
    const client = workspace.getClient(provider);
    const current = workspace.readWorkspace(user, provider);
    const isReconnect = current.username === username;

    if (!isReconnect) {
      const existingUser = await workspace.findByUsername(User, provider, username, req.userId);
      if (existingUser) {
        return res.json({
          success: false,
          error: `This ${meta.name} workspace is already linked to another account. Each workspace can only be connected to one email address.`,
        });
      }
    }

    if (current.username && current.username !== username) {
      return res.json({
        success: false,
        error: `You already have a ${meta.name} workspace connected. Disconnect it first to connect a different one.`,
      });
    }

    let loginResult;
    if (authToken && typeof authToken === 'string') {
      loginResult = { success: true, token: authToken };
    } else {
      let keys;
      try {
        keys = await client.fetchAppKeys();
      } catch (err) {
        return res.json({
          success: false,
          error: err instanceof Error ? err.message : 'Service keys unavailable. Please try again.',
        });
      }

      loginResult = await client.login({
        appKey: keys.key,
        appSecret: keys.secret,
        username,
        password,
        captchaCode,
        captchaToken,
      });

      if (!loginResult.success) {
        return res.json({ success: false, error: loginResult.error || 'Login failed.' });
      }
    }

    let boundPhone = String(current.phone || user.incoinPhone || '').replace(/^(\+91|91)/, '');
    if (!boundPhone) {
      boundPhone = String(username || '').replace(/^(\+91|91)/, '');
    }
    if (!boundPhone) {
      return res.json({
        success: false,
        error: 'No phone number is bound to this account. Please contact support.',
      });
    }

    if (current.locked && current.username && current.username !== username) {
      return res.json({
        success: false,
        error: `Your account is locked to a different ${meta.name} workspace. Contact support to change linked account.`,
      });
    }

    const encrypted = encryptToken(loginResult.token);
    workspace.writeWorkspace(user, provider, {
      username,
      token: encrypted.data,
      iv: encrypted.iv,
      tag: encrypted.tag,
      connectedAt: new Date(),
      phone: boundPhone,
      locked: true,
    });
    user.activeProvider = provider;
    await user.save();

    res.json({
      success: true,
      provider,
      username,
      phone: boundPhone,
      accountLocked: true,
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// Disconnect the connected workspace. The Incoin account, its phone number, and the
// Gmail are permanently bound at registration, so only the session token is cleared.
app.post('/api/incoin/disconnect', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const provider = resolveRequestProvider(req, user);
    workspace.writeWorkspace(user, provider, {
      token: null,
      iv: null,
      tag: null,
      connectedAt: null,
    });
    await user.save();

    res.json({ success: true, provider });
  } catch (err) {
    return serverError(res, err);
  }
});

// Current engine + connection state.
app.get('/api/incoin/state', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const slot = getSlot(req.userId);
    const provider = user ? resolveRequestProvider(req, user) : 'incoin';
    const ws = user ? workspace.readWorkspace(user, provider) : { connected: false };
    res.json({
      provider,
      activeProvider: user?.activeProvider || null,
      connected: !!ws.connected,
      username: ws.username || undefined,
      phone: ws.phone || undefined,
      accountLocked: ws.locked || false,
      running: slot.running,
      progress: slot.progress,
      status: slot.status,
      processed: slot.processed,
      taskLimit: user?.taskLimit || DEFAULT_TASK_LIMIT,
      tasksPerRun: Math.min(Math.max(1, user?.tasksPerRun || 3), user?.taskLimit || DEFAULT_TASK_LIMIT),
      services: user ? workspace.summarizeServices(user) : [],
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// Start a processing run in the background.
app.post('/api/incoin/start', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const provider = resolveRequestProvider(req, user);
    const ws = workspace.readWorkspace(user, provider);
    if (!ws.connected) {
      return res.json({ success: false, error: 'Please connect your service workspace first.' });
    }
    if ((user.credits || 0) <= 0) {
      return res.json({ success: false, error: 'Insufficient tool credits to continue.' });
    }

    const slot = getSlot(req.userId);
    if (slot.running) {
      return res.json({ success: false, error: 'A run is already in progress.' });
    }

    const token = decryptToken(ws.iv, ws.tag, ws.token);
    if (!token) {
      return res.json({ success: false, error: 'Stored session is invalid. Please reconnect.' });
    }

    const { minAmount, maxAmount, targetCount, preferredToolName, appKeys } = req.body;
    if (
      appKeys !== undefined
      && (
        typeof appKeys?.key !== 'string'
        || typeof appKeys?.secret !== 'string'
        || appKeys.key.length === 0
        || appKeys.secret.length === 0
        || appKeys.key.length > 256
        || appKeys.secret.length > 256
      )
    ) {
      return res.status(400).json({ error: 'Invalid service initialization keys.' });
    }

    // Server-side task limit enforcement: use the user's tasksPerRun preference
    // (capped by their granted taskLimit). This cannot be bypassed by crafting
    // an API request with a higher targetCount.
    const taskLimit = user.taskLimit || DEFAULT_TASK_LIMIT;
    const tasksPerRun = Math.min(Math.max(1, user.tasksPerRun || 3), taskLimit);
    const effectiveTargetCount = resolveTaskLimit(targetCount || tasksPerRun, taskLimit);

    const engine = new GrabEngine({
      username: ws.username,
      token,
      minAmount: Number(minAmount) || 100,
      maxAmount: Number(maxAmount) || 0,
      targetCount: effectiveTargetCount,
      preferredToolName,
      provider,
      appKeys,
      onEvent: (ev) => emitToSlot(slot, ev),
    });

    slot.engine = engine;
    slot.running = true;
    slot.progress = 0;
    slot.status = 'Initializing...';
    slot.processed = 0;
    slot.buffer = [];

    res.json({ success: true, taskLimit: effectiveTargetCount });

    (async () => {
      try {
        const result = await engine.run();
        slot.running = false;

        if (result.processed > 0 && (user.credits || 0) > 0) {
          await User.findByIdAndUpdate(req.userId, { $inc: { credits: -1 } });
          await Log.create({
            userId: req.userId,
            ordersCount: result.processed,
            creditsUsed: 1,
          });
        }

        const eventName = engine.stopped ? 'stopped' : 'done';
        const payload = {
          success: result.success,
          message: result.message,
          logs: result.logs,
          processed: result.processed,
          progress: 100,
          processedTasks: result.processedTasks || [],
        };

        for (const res of [...slot.listeners]) {
          try {
            res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
            res.end();
          } catch (err) {
            /* connection already closed */
          }
        }
        slot.listeners.clear();
        slot.engine = null;
      } catch (err) {
        slot.running = false;
        slot.engine = null;
      }
    })();
  } catch (err) {
    return serverError(res, err);
  }
});

// Request a stop of the current run.
app.post('/api/incoin/stop', authMiddleware, async (req, res) => {
  const slot = getSlot(req.userId);
  if (slot.engine) slot.engine.stop();
  res.json({ success: true });
});

// Server-Sent Events stream for live progress.
app.get('/api/incoin/stream', authMiddleware, (req, res) => {
  const slot = getSlot(req.userId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Replay buffered progress events first.
  for (const ev of slot.buffer) {
    res.write(`event: progress\ndata: ${JSON.stringify(ev)}\n\n`);
  }

  if (!slot.running) {
    res.write(`event: stopped\ndata: {}\n\n`);
    return res.end();
  }

  slot.listeners.add(res);
  req.on('close', () => slot.listeners.delete(res));
});

// ──────────────────────────────────────────────────────────────
// Serve the built React frontend (production)
// ──────────────────────────────────────────────────────────────
const webDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

// ──────────────────────────────────────────────────────────────
// Startup
// ──────────────────────────────────────────────────────────────
async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add your MongoDB connection string to .env');
  }
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 10,
    minPoolSize: 1,
    retryWrites: true,
  });
  console.log('Connected to MongoDB');
}

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected');
});
mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});
mongoose.connection.on('error', (err) => {
  console.error('MongoDB error:', err.message);
});

async function migrateTaskLogs() {
  try {
    const db = mongoose.connection.db;
    if (!db) return;
    const source = db.collection('logs');
    const dest = db.collection('tasklogs');
    const legacy = await source.find({ userId: { $exists: true }, ordersCount: { $exists: true } }).toArray();
    if (!legacy.length) return;
    for (const doc of legacy) {
      const exists = await dest.findOne({ _id: doc._id });
      if (!exists) {
        await dest.insertOne(doc);
      }
    }
    console.log(`Migrated ${legacy.length} task log(s) into tasklogs`);
  } catch (err) {
    console.warn('Task log migration skipped:', err.message);
  }
}

async function unsetNullUniqueFields() {
  try {
    const fields = ['pakkagoUsername', 'incoinUsername', 'incoinPhone'];
    let modified = 0;
    for (const field of fields) {
      const result = await User.updateMany({ [field]: null }, { $unset: { [field]: '' } });
      modified += result.modifiedCount || 0;
    }
    if (modified) {
      console.log(`Normalized ${modified} user document(s) for sparse unique indexes`);
    }
  } catch (err) {
    console.warn('Sparse index normalization skipped:', err.message);
  }
}

app.use((err, req, res, next) => {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  return serverError(res, err);
});

async function start() {
  await connectMongo();
  await unsetNullUniqueFields();
  await migrateTaskLogs();
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
  return server;
}

if (require.main === module) {
  start().catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
}

module.exports = { app, start, User, Log, Referral, Device };
