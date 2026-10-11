const APP_VERSION = '46';
const APP_ID = 'xyz.indianx.app';
const CLIENT_TYPE = 'Android';
const OS_VERSION = '30';
const GAID = 'd802a45a-8b82-45a7-932f-abcdef123456';
const ANDROID_ID = 'a1b2c3d4e5f6g7h8';
const LANGUAGE = 'en';
const BASE_URL = 'https://api.incoinpay.net';

async function hmacSha1Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSign(
  bodyParams: Record<string, unknown>,
  headerParams: Record<string, string>,
  appSecret: string,
): Promise<string> {
  const all: Record<string, unknown> = { ...bodyParams, ...headerParams };
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
  return hmacSha1Hex(appSecret, signStr);
}

function baseHeaders(opts: { clientKey?: string; sign?: string; token?: string; timestamp?: string } = {}) {
  const ts = opts.timestamp || String(Date.now());
  return {
    timestamp: ts,
    version: APP_VERSION,
    OSVersion: OS_VERSION,
    clientKey: opts.clientKey || '',
    clientType: CLIENT_TYPE,
    appId: APP_ID,
    language: LANGUAGE,
    gaid: GAID,
    androidId: ANDROID_ID,
    sign: opts.sign || '',
    ...(opts.token ? { token: opts.token } : {}),
    'Content-Type': 'application/json',
  };
}

function readCaptchaToken(resp: Response): string | null {
  return (
    resp.headers.get('captchatoken') ||
    resp.headers.get('captchaToken') ||
    resp.headers.get('CaptchaToken') ||
    null
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function fetchCaptcha(): Promise<{ captchaToken: string; imageBase64: string }> {
  const resp = await fetch(`${BASE_URL}/anon/test/getCaptcha`, {
    method: 'GET',
    cache: 'no-store',
  });
  const token = readCaptchaToken(resp);
  const blob = await resp.blob();
  if (!resp.ok || !token || blob.size === 0) {
    throw new Error('Could not load captcha. Check your connection.');
  }
  return { captchaToken: token, imageBase64: await blobToBase64(blob) };
}

export async function fetchAppKeys(): Promise<{ key: string; secret: string } | null> {
  try {
    const resp = await fetch(`${BASE_URL}/anon/client/checkVersion`, {
      method: 'GET',
      headers: baseHeaders(),
      cache: 'no-store',
    });
    const data = await resp.json();
    if (data?.data?.clientKey && data?.data?.clientSecret) {
      return { key: data.data.clientKey, secret: data.data.clientSecret };
    }
  } catch {
    return null;
  }
  return null;
}

export async function login(input: {
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
  captchaCode: string;
  captchaToken: string;
}): Promise<{ success: true; token: string } | { success: false; error: string }> {
  try {
    const timestamp = String(Date.now());
    const body = {
      userName: input.username,
      passwd: input.password,
      captcha: input.captchaCode,
      captchaToken: input.captchaToken,
    };
    const headerParams = {
      timestamp,
      version: APP_VERSION,
      OSVersion: OS_VERSION,
      clientKey: input.appKey,
      clientType: CLIENT_TYPE,
    };
    const sign = await generateSign(body, headerParams, input.appSecret);
    const headers = baseHeaders({ clientKey: input.appKey, sign, timestamp });
    const resp = await fetch(`${BASE_URL}/anon/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    const code = data?.code;
    if (code === 0 || code === '0' || code === '000000') {
      const token = data?.data?.token;
      if (token) return { success: true, token };
    }
    return { success: false, error: data?.msg || 'Login failed' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}
