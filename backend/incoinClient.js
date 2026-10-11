const crypto = require('crypto');

// ──────────────────────────────────────────────────────────────
// App constants — must match the Android APK signing constants
// ──────────────────────────────────────────────────────────────
const APP_VERSION = '46';
const APP_ID = 'xyz.indianx.app';
const CLIENT_TYPE = 'Android';
const OS_VERSION = '30';
const GAID = 'd802a45a-8b82-45a7-932f-abcdef123456';
const ANDROID_ID = 'a1b2c3d4e5f6g7h8';
const LANGUAGE = 'en';
const BASE_URL = process.env.INCOIN_BASE_URL || 'https://api.incoinpay.net';

const TIMEOUT_MS = 10000;
const USER_AGENT = 'okhttp/4.12.0';

function generateSign(bodyParams, headerParams, appSecret) {
  const all = { ...bodyParams, ...headerParams };
  const entries = Object.entries(all);

  entries.sort((a, b) => {
    const x = String(a[1]);
    const y = String(b[1]);
    return x < y ? -1 : x > y ? 1 : 0;
  });

  const signStr = entries
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
    .map(([, v]) => String(v))
    .join('');

  return crypto.createHmac('sha1', String(appSecret)).update(signStr).digest('hex');
}

function deviceHeaders({ clientKey = '', sign = '', token, timestamp } = {}) {
  const ts = timestamp || String(Date.now());
  return {
    timestamp: ts,
    version: APP_VERSION,
    OSVersion: OS_VERSION,
    clientKey,
    clientType: CLIENT_TYPE,
    appId: APP_ID,
    language: LANGUAGE,
    gaid: GAID,
    androidId: ANDROID_ID,
    sign,
    ...(token ? { token } : {}),
    'User-Agent': USER_AGENT,
  };
}

function baseHeaders(opts = {}) {
  return {
    ...deviceHeaders(opts),
    'Content-Type': 'application/json',
  };
}

// ── Generic signed API request (mirrors Python `_api_request`) ─
async function apiRequest(endpoint, bodyParams = {}, appKey, appSecret, token, method = 'POST') {
  const timestamp = String(Date.now());
  const headerParams = {
    timestamp,
    version: APP_VERSION,
    OSVersion: OS_VERSION,
    clientKey: appKey,
    clientType: CLIENT_TYPE,
  };
  if (token) headerParams.token = token;

  const sign = generateSign(bodyParams, headerParams, appSecret);

  const headers = {
    ...headerParams,
    appId: APP_ID,
    language: LANGUAGE,
    gaid: GAID,
    androidId: ANDROID_ID,
    sign,
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  };

  const url = `${BASE_URL}${endpoint}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let resp;
    if (method.toUpperCase() === 'GET') {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(bodyParams)) qs.append(k, String(v));
      const sep = qs.toString() ? `?${qs.toString()}` : '';
      resp = await fetch(`${url}${sep}`, { headers, signal: controller.signal });
    } else {
      resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyParams),
        signal: controller.signal,
      });
    }
    clearTimeout(timer);
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      return { code: -1, msg: text };
    }
  } catch (err) {
    return { code: -1, msg: `Network/Http Error: ${err.message}` };
  }
}

// ── Step 1 — Fetch app keys ──────────────────────────────────
async function fetchAppKeys() {
  try {
    const resp = await fetch(`${BASE_URL}/anon/client/checkVersion`, {
      headers: baseHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await resp.json();
    if (data && data.data) {
      return {
        key: data.data.clientKey,
        secret: data.data.clientSecret,
        forcedUpgrade: Number(data.data.forcedUpgrade) === 1,
      };
    }
    console.warn(`[incoin] checkVersion unexpected payload (HTTP ${resp.status})`);
  } catch (err) {
    console.warn(`[incoin] checkVersion failed: ${err.message}`);
    return null;
  }
  return null;
}

async function checkAppUpdate() {
  try {
    const resp = await fetch(`${BASE_URL}/anon/client/checkVersion`, {
      headers: baseHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await resp.json();
    if (data && data.data) {
      return Number(data.data.forcedUpgrade) === 1;
    }
  } catch (err) {
    return false;
  }
  return false;
}

function readCaptchaToken(resp) {
  const names = ['captchatoken', 'captchaToken', 'CaptchaToken', 'captcha-token'];
  for (const name of names) {
    const value = resp.headers.get(name);
    if (value) return value;
  }
  return null;
}

async function fetchCaptchaOnce(headers) {
  const resp = await fetch(`${BASE_URL}/anon/test/getCaptcha`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const token = readCaptchaToken(resp);
  const buffer = Buffer.from(await resp.arrayBuffer());
  if (resp.ok && token && buffer.length) {
    return { token, imageBase64: buffer.toString('base64') };
  }
  console.warn(
    `[incoin] captcha HTTP ${resp.status} token=${token ? 'yes' : 'no'} bytes=${buffer.length}`,
  );
  return null;
}

async function fetchCaptcha() {
  const attempts = [
    { ...deviceHeaders(), Accept: 'image/png,image/*,*/*' },
    deviceHeaders(),
    {},
  ];
  for (const headers of attempts) {
    try {
      const result = await fetchCaptchaOnce(headers);
      if (result) return result;
    } catch {
      continue;
    }
  }
  return null;
}

// ── Step 3 — Login with captcha ──────────────────────────────
async function login({ appKey, appSecret, username, password, captchaCode, captchaToken }) {
  try {
    const timestamp = String(Date.now());
    const body = {
      userName: username,
      passwd: password,
      captcha: captchaCode,
      captchaToken,
    };
    const headerParams = {
      timestamp,
      version: APP_VERSION,
      OSVersion: OS_VERSION,
      clientKey: appKey,
      clientType: CLIENT_TYPE,
    };
    const sign = generateSign(body, headerParams, appSecret);
    const headers = baseHeaders({ clientKey: appKey, sign, timestamp });

    const resp = await fetch(`${BASE_URL}/anon/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await resp.json();
    if (isSuccess(data)) {
      const token = data.data && data.data.token;
      // Also check if phone is in login response
      const phone = data.data?.phone || data.data?.mobile || data.data?.phoneNumber ||
                    data.data?.mobileNumber || data.data?.contactNo || data.data?.contact || null;
      if (token) return { success: true, token, phone, rawData: data.data };
    }
    return { success: false, error: data.msg || 'Login failed' };
  } catch (err) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}

// ── Success check (code 0 / '0' / '000000') ──────────────────
function isSuccess(res) {
  if (!res || typeof res !== 'object') return false;
  const code = res.code;
  return code === 0 || code === '0' || code === '000000';
}

// ── Fetch user profile (to get phone number) ─────────────────
async function getUserProfile({ appKey, appSecret, token }) {
  const res = await apiRequest('/api/user/info', {}, appKey, appSecret, token, 'GET');
  if (!isSuccess(res)) {
    return { success: false, error: (res && res.msg) || 'Failed to fetch user profile.' };
  }
  // Try multiple possible field names for phone number
  const phone = res.data?.phone || res.data?.mobile || res.data?.phoneNumber ||
                res.data?.mobileNumber || res.data?.contactNo || res.data?.contact || null;
  console.log('[incoin] getUserProfile response:', JSON.stringify(res.data));
  console.log('[incoin] Extracted phone:', phone);
  return { success: true, phone, data: res.data };
}

// ── Select payment tool ──────────────────────────────────────
async function selectPaymentTool({ appKey, appSecret, token, preferredToolName }) {
  const res = await apiRequest('/api/tool/mylist', {}, appKey, appSecret, token, 'GET');
  if (!isSuccess(res)) {
    return { tool: null, error: (res && res.msg) || 'Failed to fetch payment tools.' };
  }
  const tools = Array.isArray(res.data) ? res.data : [];
  if (tools.length === 0) {
    return { tool: null, error: 'No payment tools found on account.' };
  }

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  if (preferredToolName && String(preferredToolName).toLowerCase() !== 'any') {
    const query = String(preferredToolName).toLowerCase();
    for (const tool of tools) {
      if (norm(tool.toolName).includes(norm(query))) {
        return { tool, error: null };
      }
    }
  }

  for (const tool of tools) {
    if (norm(tool.toolName) === 'freecharge') return { tool, error: null };
  }
  return { tool: tools[0], error: null };
}

// ── Fetch task list ──────────────────────────────────────────
// The grab-list / grab endpoints carry a build-date suffix (e.g.
// /api/order/grablist20260823) and are rotated by the API. The suffix is
// cached here and re-discovered from the public Swagger docs whenever the
// cached path stops resolving.
let cachedGrabDate = process.env.INCOIN_GRAB_DATE || '';

function grabListPath() {
  return cachedGrabDate ? `/api/order/grablist${cachedGrabDate}` : '/api/order/grablist';
}

function grabPath() {
  return cachedGrabDate ? `/api/order/grab${cachedGrabDate}` : '/api/order/grab';
}

function isRouteError(res) {
  if (!res) return false;
  const code = String(res.code || '');
  const msg = String(res.msg || '');
  return (
    code === '404' ||
    code === '405' ||
    /method is not supported/i.test(msg) ||
    /not found/i.test(msg)
  );
}

async function discoverGrabDate() {
  try {
    const resp = await fetch(`${BASE_URL}/v2/api-docs`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const docs = await resp.json();
    const paths = Object.keys(docs.paths || {});
    for (const p of paths) {
      const m = p.match(/\/api\/order\/(?:grablist|grab)(\d{8})$/);
      if (m) {
        cachedGrabDate = m[1];
        console.warn(`[incoin] Grab endpoints now use date ${cachedGrabDate}`);
        return m[1];
      }
    }
  } catch (err) {
    console.warn(`[incoin] Could not discover grab endpoints: ${err.message}`);
  }
  return null;
}

function extractTaskRecords(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.records)) return data.records;
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(data.tasks)) return data.tasks;
  return [];
}

async function fetchTaskList({ appKey, appSecret, token }) {
  const body = { page: 1, size: 50, data: {} };

  let res = await apiRequest(grabListPath(), body, appKey, appSecret, token, 'POST');
  if (isRouteError(res)) {
    await discoverGrabDate();
    res = await apiRequest(grabListPath(), body, appKey, appSecret, token, 'POST');
  }

  if (!res) return { tasks: [], error: 'Connection failed or timeout' };
  if (!isSuccess(res)) {
    return { tasks: [], error: res.msg || JSON.stringify(res) };
  }
  return { tasks: extractTaskRecords(res.data), error: null };
}

// ── Initialize a single task ─────────────────────────────────
async function initializeTask({ taskId, selectedTool, appKey, appSecret, token }) {
  const upi =
    selectedTool.upiAddr !== undefined && selectedTool.upiAddr !== null
      ? selectedTool.upiAddr
      : selectedTool.account !== undefined && selectedTool.account !== null
        ? selectedTool.account
        : selectedTool.toolAccount;

  const body = {
    orderId: taskId,
    toolType: selectedTool.toolType,
    upiAddr: upi,
  };

  let res = await apiRequest(grabPath(), body, appKey, appSecret, token, 'POST');
  if (isRouteError(res)) {
    await discoverGrabDate();
    res = await apiRequest(grabPath(), body, appKey, appSecret, token, 'POST');
  }
  return res;
}

// ── Verify a task ────────────────────────────────────────────
async function verifyTask({ taskId, appKey, appSecret, token }) {
  return apiRequest(
    '/api/order/machine/review',
    { orderId: taskId },
    appKey,
    appSecret,
    token,
    'POST',
  );
}

module.exports = {
  BASE_URL,
  generateSign,
  baseHeaders,
  apiRequest,
  fetchAppKeys,
  checkAppUpdate,
  fetchCaptcha,
  login,
  getUserProfile,
  selectPaymentTool,
  fetchTaskList,
  initializeTask,
  verifyTask,
  isSuccess,
};
