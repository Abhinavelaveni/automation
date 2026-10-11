const crypto = require('crypto');

const APP_VERSION = '46';
const APP_ID = 'com.pakkago.app';
const CLIENT_TYPE = 'Android';
const OS_VERSION = '30';
const GAID = 'd802a45a-8b82-45a7-932f-abcdef123456';
const ANDROID_ID = 'a1b2c3d4e5f6g7h8';
const LANGUAGE = 'en';
const BASE_URL = process.env.PAKKAGO_BASE_URL || 'https://api.pakkago.com';

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

async function apiRequest(endpoint, bodyParams = {}, appKey, appSecret, token, method = 'POST', timeoutMs = TIMEOUT_MS) {
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
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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

async function fetchAppKeys() {
  let resp;
  try {
    resp = await fetch(`${BASE_URL}/anon/client/checkVersion`, {
      headers: baseHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const cause = err.cause?.code || err.message;
    throw new Error(`PakkaGo initialization request failed: ${cause}`);
  }

  if (!resp.ok) {
    throw new Error(`PakkaGo initialization request returned HTTP ${resp.status}.`);
  }

  let data;
  try {
    data = await resp.json();
  } catch {
    throw new Error('PakkaGo initialization returned an invalid response.');
  }

  if (!data?.data?.clientKey || !data?.data?.clientSecret) {
    throw new Error('PakkaGo initialization response did not include service keys.');
  }

  return {
    key: data.data.clientKey,
    secret: data.data.clientSecret,
    forcedUpgrade: Number(data.data.forcedUpgrade) === 1,
  };
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
  } catch {
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

function isSuccess(res) {
  if (!res || typeof res !== 'object') return false;
  const code = res.code;
  return code === 0 || code === '0' || code === '000000';
}

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
      const phone =
        data.data?.phone ||
        data.data?.mobile ||
        data.data?.phoneNumber ||
        data.data?.mobileNumber ||
        data.data?.contactNo ||
        data.data?.contact ||
        null;
      if (token) return { success: true, token, phone, rawData: data.data };
    }
    return { success: false, error: data.msg || 'Login failed' };
  } catch (err) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}

async function getUserProfile({ appKey, appSecret, token }) {
  const res = await apiRequest('/api/user/info', {}, appKey, appSecret, token, 'GET');
  if (!isSuccess(res)) {
    return { success: false, error: (res && res.msg) || 'Failed to fetch user profile.' };
  }
  const phone =
    res.data?.phone ||
    res.data?.mobile ||
    res.data?.phoneNumber ||
    res.data?.mobileNumber ||
    res.data?.contactNo ||
    res.data?.contact ||
    null;
  return { success: true, phone, data: res.data };
}

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
  const res = await apiRequest('/api/order/grablist', body, appKey, appSecret, token, 'POST', 8000);
  if (!res) return { tasks: [], error: 'Connection failed or timeout' };
  if (!isSuccess(res)) {
    return { tasks: [], error: res.msg || JSON.stringify(res) };
  }
  return { tasks: extractTaskRecords(res.data), error: null };
}

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

  return apiRequest('/api/order/grab', body, appKey, appSecret, token, 'POST', 8000);
}

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
