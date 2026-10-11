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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
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

const referralUploadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  contentType: { type: String, required: true },
  data: { type: Buffer, required: true },
  createdAt: { type: Date, default: Date.now },
});

const engineRunSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: String, enum: ['incoin', 'pakkago'], required: true },
  params: { type: mongoose.Schema.Types.Mixed, required: true },
  state: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  status: { type: String, default: 'queued' },
  active: { type: Boolean, default: true },
  stopRequested: { type: Boolean, default: false },
  progress: { type: Number, default: 0 },
  processed: { type: Number, default: 0 },
  logs: { type: [String], default: [] },
  processedTasks: { type: [mongoose.Schema.Types.Mixed], default: [] },
  success: { type: Boolean, default: false },
  message: { type: String, default: 'Queued for processing.' },
  lockedUntil: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
engineRunSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);

const User = mongoose.model('User', userSchema);
const Log = mongoose.model('TaskLog', logSchema, 'tasklogs');
const Referral = mongoose.model('Referral', referralSchema);
const Device = mongoose.model('Device', deviceSchema);
const ReferralUpload = mongoose.model('ReferralUpload', referralUploadSchema);
const EngineRun = mongoose.model('EngineRun', engineRunSchema);

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
// Core API
// ──────────────────────────────────────────────────────────────
function healthHandler(req, res) {
  const dbState = mongoose.connection.readyState;
  const dbOk = dbState === 1;
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    db: dbOk ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected',
  });
}

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

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
    const storedFile = await ReferralUpload.create({
      userId: req.userId,
      contentType: req.file.mimetype,
      data: req.file.buffer,
    });
    const fileUrl = `/api/uploads/${storedFile.id}`;
    res.json({ url: fileUrl });
  } catch (err) {
    return serverError(res, err);
  }
});

app.get('/api/uploads/:fileId', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.fileId)) return res.status(404).end();
  try {
    const file = await ReferralUpload.findById(req.params.fileId).select('contentType data');
    if (!file) return res.status(404).end();
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(file.data);
  } catch (err) {
    return serverError(res, err);
  }
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
    const provider = user ? resolveRequestProvider(req, user) : 'incoin';
    const ws = user ? workspace.readWorkspace(user, provider) : { connected: false };
    const run = await EngineRun.findOne({ userId: req.userId, active: true })
      .sort({ createdAt: -1 })
      .lean()
      || await EngineRun.findOne({ userId: req.userId }).sort({ createdAt: -1 }).lean();
    res.json({
      provider,
      activeProvider: user?.activeProvider || null,
      connected: !!ws.connected,
      username: ws.username || undefined,
      phone: ws.phone || undefined,
      accountLocked: ws.locked || false,
      running: !!run?.active,
      progress: run?.progress || 0,
      status: run?.message || '',
      processed: run?.processed || 0,
      logs: run?.logs || [],
      runStatus: run?.status || null,
      success: !!run?.success,
      processedTasks: run?.processedTasks || [],
      taskLimit: user?.taskLimit || DEFAULT_TASK_LIMIT,
      tasksPerRun: Math.min(Math.max(1, user?.tasksPerRun || 3), user?.taskLimit || DEFAULT_TASK_LIMIT),
      services: user ? workspace.summarizeServices(user) : [],
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// Queue a processing run for the scheduled Vercel worker.
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

    if (await EngineRun.exists({ userId: req.userId, active: true })) {
      return res.json({ success: false, error: 'A run is already in progress.' });
    }

    if (!decryptToken(ws.iv, ws.tag, ws.token)) {
      return res.json({ success: false, error: 'Stored session is invalid. Please reconnect.' });
    }

    const { minAmount, maxAmount, targetCount, preferredToolName } = req.body;

    // Server-side task limit enforcement: use the user's tasksPerRun preference
    // (capped by their granted taskLimit). This cannot be bypassed by crafting
    // an API request with a higher targetCount.
    const taskLimit = user.taskLimit || DEFAULT_TASK_LIMIT;
    const tasksPerRun = Math.min(Math.max(1, user.tasksPerRun || 3), taskLimit);
    const effectiveTargetCount = resolveTaskLimit(targetCount || tasksPerRun, taskLimit);

    const run = await EngineRun.create({
      userId: req.userId,
      provider,
      params: {
        username: ws.username,
        minAmount: Number(minAmount) || 100,
        maxAmount: Number(maxAmount) || 0,
        targetCount: effectiveTargetCount,
        preferredToolName,
      },
    });
    res.json({ success: true, runId: run.id, taskLimit: effectiveTargetCount });
  } catch (err) {
    if (err.code === 11000) {
      return res.json({ success: false, error: 'A run is already in progress.' });
    }
    return serverError(res, err);
  }
});

// Request a stop of the current run.
app.post('/api/incoin/stop', authMiddleware, async (req, res) => {
  try {
    await EngineRun.updateOne(
      { userId: req.userId, active: true },
      { $set: { stopRequested: true, status: 'stopping', message: 'Stopping...' } },
    );
    res.json({ success: true });
  } catch (err) {
    return serverError(res, err);
  }
});

app.get('/api/internal/worker', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'CRON_SECRET is not configured.' });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();
    const run = await EngineRun.findOneAndUpdate(
      {
        active: true,
        $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
      },
      {
        $set: {
          lockedUntil: new Date(now.getTime() + 90000),
          status: 'running',
          message: 'Processing...',
          updatedAt: now,
        },
      },
      { sort: { createdAt: 1 }, new: true },
    );
    if (!run) return res.json({ success: true, processed: 0 });

    const finalizeRun = async (status, message, result = {}) => {
      const finalRun = await EngineRun.findOneAndUpdate(
        { _id: run._id, active: true },
        {
          $set: {
            ...result,
            status,
            message,
            active: false,
            lockedUntil: null,
            updatedAt: new Date(),
          },
        },
        { new: true },
      );
      if (finalRun?.processed > 0) {
        const debit = await User.updateOne(
          { _id: finalRun.userId, credits: { $gt: 0 } },
          { $inc: { credits: -1 } },
        );
        if (debit.modifiedCount > 0) {
          await Log.create({
            userId: finalRun.userId,
            ordersCount: finalRun.processed,
            creditsUsed: 1,
          });
        }
      }
      return finalRun;
    };

    if (run.stopRequested) {
      const tasks = run.state?.processedJobs || [];
      await finalizeRun('stopped', 'Stopped by user.', {
        success: tasks.length > 0,
        processed: tasks.length,
        processedTasks: tasks.map((task) => ({ taskId: task.id })),
        progress: 100,
      });
      return res.json({ success: true, processed: tasks.length });
    }

    const user = await User.findById(run.userId);
    if (!user) {
      await finalizeRun('failed', 'User not found.');
      return res.json({ success: false, error: 'User not found.' });
    }
    const ws = workspace.readWorkspace(user, run.provider);
    const token = decryptToken(ws.iv, ws.tag, ws.token);
    if (!token) {
      await finalizeRun('failed', 'Stored session is invalid. Please reconnect.');
      return res.json({ success: false, error: 'Stored session is invalid.' });
    }

    const engine = new GrabEngine({
      ...run.params,
      token,
      provider: run.provider,
      resumeState: run.state,
      sliceDurationMs: 25000,
      onEvent: async (event) => {
        const state = event.state || run.state;
        const processedTasks = (state?.processedJobs || [])
          .filter((task) => task.verified)
          .map((task) => ({ taskId: task.id }));
        await EngineRun.updateOne(
          { _id: run._id, active: true, stopRequested: false },
          {
            $set: {
              state,
              logs: event.logs || [],
              processed: processedTasks.length,
              processedTasks,
              progress: event.progress || 0,
              status: 'running',
              message: event.status || event.message,
              updatedAt: new Date(),
            },
          },
        );
      },
    });
    const result = await engine.run();
    const latestRun = await EngineRun.findById(run._id).select('stopRequested');
    const processedTasks = result.processedTasks || [];
    const state = result.state || run.state;
    const logs = result.logs || [];
    const progress = result.paused
      ? Math.min(99, Math.round((result.processed / run.params.targetCount) * 100))
      : 100;

    if (latestRun?.stopRequested || result.stopped) {
      await finalizeRun('stopped', 'Stopped by user.', {
        state,
        logs,
        processed: result.processed,
        processedTasks,
        progress: 100,
        success: result.success,
      });
    } else if (result.paused) {
      await EngineRun.updateOne(
        { _id: run._id, active: true },
        {
          $set: {
            state,
            logs,
            processed: result.processed,
            processedTasks,
            progress,
            status: 'queued',
            message: result.message,
            lockedUntil: null,
            updatedAt: new Date(),
          },
        },
      );
    } else {
      await finalizeRun(result.failed ? 'failed' : 'completed', result.message, {
        state,
        logs,
        processed: result.processed,
        processedTasks,
        progress: 100,
        success: result.success,
      });
    }

    res.json({ success: true, runId: run.id, status: result.paused ? 'queued' : 'completed' });
  } catch (err) {
    console.error('Vercel worker failed:', err);
    return serverError(res, err);
  }
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
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 5,
    minPoolSize: 0,
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

let connectionPromise;
let modelIndexesPromise;
let migrationsPromise;

async function ensureReady({ runMigrations = false } = {}) {
  if (!connectionPromise) {
    connectionPromise = connectMongo().catch((err) => {
      connectionPromise = null;
      throw err;
    });
  }
  await connectionPromise;
  if (!modelIndexesPromise) {
    modelIndexesPromise = Promise.all([EngineRun.init(), ReferralUpload.init()]).catch((err) => {
      modelIndexesPromise = null;
      throw err;
    });
  }
  await modelIndexesPromise;
  if (runMigrations && !migrationsPromise) {
    migrationsPromise = (async () => {
      await unsetNullUniqueFields();
      await migrateTaskLogs();
    })().catch((err) => {
      migrationsPromise = null;
      throw err;
    });
  }
  if (migrationsPromise) await migrationsPromise;
}

async function start() {
  await ensureReady({ runMigrations: true });
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

module.exports = { app, start, ensureReady, User, Log, Referral, Device, EngineRun, ReferralUpload };
