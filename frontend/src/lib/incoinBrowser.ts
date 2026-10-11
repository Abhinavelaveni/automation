const APP_VERSION = '46';
const APP_ID = 'xyz.indianx.app';
const CLIENT_TYPE = 'Android';
const OS_VERSION = '30';
const GAID = 'd802a45a-8b82-45a7-932f-abcdef123456';
const ANDROID_ID = 'a1b2c3d4e5f6g7h8';
const LANGUAGE = 'en';
const BASE_URL = new URL(
  import.meta.env.VITE_INCOIN_BASE_URL || 'https://api.incoinpay.net',
).origin;

function endpointUrl(path: string): string {
  return new URL(path, `${BASE_URL}/`).toString();
}

function baseHeaders(opts: { clientKey?: string; sign?: string; timestamp?: string } = {}) {
  return {
    timestamp: opts.timestamp || String(Date.now()),
    version: APP_VERSION,
    OSVersion: OS_VERSION,
    clientKey: opts.clientKey || '',
    clientType: CLIENT_TYPE,
    appId: APP_ID,
    language: LANGUAGE,
    gaid: GAID,
    androidId: ANDROID_ID,
    sign: opts.sign || '',
    'Content-Type': 'application/json',
  };
}

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
  const entries = Object.entries({ ...bodyParams, ...headerParams });
  entries.sort((a, b) => {
    const x = String(a[1]);
    const y = String(b[1]);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const signString = entries
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    .map(([, value]) => String(value))
    .join('');
  return hmacSha1Hex(appSecret, signString);
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
  const url = endpointUrl('/anon/test/getCaptcha');
  console.log('[incoin] Fetching CAPTCHA from', url);

  try {
    const resp = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
    });

    console.log('[incoin] CAPTCHA response status:', resp.status);
    console.log('[incoin] CAPTCHA response headers:', {
      contentType: resp.headers.get('content-type'),
      captchaTokenHeader: resp.headers.get('captchatoken') ? 'present' : 'missing',
    });

    const token = readCaptchaToken(resp);
    console.log('[incoin] CAPTCHA token extracted:', token ? 'yes' : 'no');

    const blob = await resp.blob();
    console.log('[incoin] CAPTCHA image blob size:', blob.size, 'bytes');

    if (!resp.ok) {
      const detail = resp.status === 401 ? 'Unauthorized' : resp.status === 403 ? 'Forbidden (may be IP/geo restricted)' : `HTTP ${resp.status}`;
      throw new Error(`CAPTCHA request failed: ${detail}`);
    }

    if (!token) {
      throw new Error('CAPTCHA response did not include token header. Server may not expose required headers.');
    }

    if (blob.size === 0) {
      throw new Error('CAPTCHA response was empty.');
    }

    const imageBase64 = await blobToBase64(blob);
    console.log('[incoin] CAPTCHA loaded successfully, image size:', imageBase64.length, 'chars');

    return { captchaToken: token, imageBase64 };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[incoin] CAPTCHA fetch failed:', errorMsg);
    throw new Error(`Could not load CAPTCHA: ${errorMsg}`);
  }
}

export async function fetchAppKeys(): Promise<{ key: string; secret: string }> {
  const url = endpointUrl('/anon/client/checkVersion');
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: baseHeaders(),
      cache: 'no-store',
    });
  } catch (error) {
    console.error('[incoin] Browser initialization request failed', {
      host: new URL(url).host,
      path: new URL(url).pathname,
      error: error instanceof Error ? error.message : 'Network error',
    });
    throw new Error('Could not reach Incoin initialization from this browser.');
  }

  if (!response.ok) {
    const actualUrl = new URL(response.url || url);
    console.error('[incoin] Browser initialization request returned an error', {
      status: response.status,
      host: actualUrl.host,
      path: actualUrl.pathname,
      contentType: response.headers.get('content-type'),
    });
    throw new Error(
      `Incoin initialization request returned HTTP ${response.status} from ${actualUrl.host}${actualUrl.pathname}.`,
    );
  }

  let result: {
    code?: number | string;
    data?: { clientKey?: unknown; clientSecret?: unknown };
    msg?: string;
  };
  try {
    result = await response.json();
  } catch {
    throw new Error('Incoin initialization returned an invalid response.');
  }

  if (
    (result.code !== 0 && result.code !== '0' && result.code !== '000000')
    || typeof result.data?.clientKey !== 'string'
    || typeof result.data.clientSecret !== 'string'
  ) {
    throw new Error(result.msg || 'Incoin initialization did not return valid client keys.');
  }

  return { key: result.data.clientKey, secret: result.data.clientSecret };
}

export async function login(input: {
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
  captchaCode: string;
  captchaToken: string;
}): Promise<{ success: true; token: string } | { success: false; error: string }> {
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

  try {
    const response = await fetch(endpointUrl('/anon/login'), {
      method: 'POST',
      headers: baseHeaders({ clientKey: input.appKey, sign, timestamp }),
      body: JSON.stringify(body),
    });
    const result = await response.json();

    if (response.ok && (result.code === 0 || result.code === '0' || result.code === '000000')) {
      if (typeof result.data?.token === 'string' && result.data.token) {
        return { success: true, token: result.data.token };
      }
    }
    return { success: false, error: result.msg || `Incoin login failed (HTTP ${response.status}).` };
  } catch (error) {
    console.error('[incoin] Browser login request failed', {
      error: error instanceof Error ? error.message : 'Network error',
    });
    return { success: false, error: 'Could not complete Incoin login from this browser.' };
  }
}

// ──────────────────────────────────────────────────────────────
// Signed API calls (task list / grab / review) — run from the browser
// so Incoin sees the user's own network, exactly like the working site.
// ──────────────────────────────────────────────────────────────
export interface AppKeys {
  key: string;
  secret: string;
}

export interface ApiResponse {
  code?: number | string;
  msg?: string;
  message?: string;
  data?: any;
  httpStatus?: number;
  [k: string]: unknown;
}

const TIMEOUT_MS = 10000;

export function isSuccess(res: ApiResponse | null | undefined): boolean {
  if (!res || typeof res !== 'object') return false;
  return res.code === 0 || res.code === '0' || res.code === '000000';
}

async function apiRequest(
  endpoint: string,
  bodyParams: Record<string, unknown>,
  keys: AppKeys,
  token: string,
  method: 'GET' | 'POST' = 'POST',
): Promise<ApiResponse> {
  const headerParams: Record<string, string> = {
    timestamp: String(Date.now()),
    version: APP_VERSION,
    OSVersion: OS_VERSION,
    clientKey: keys.key,
    clientType: CLIENT_TYPE,
  };
  if (token) headerParams.token = token;

  const sign = await generateSign(bodyParams, headerParams, keys.secret);
  const headers: Record<string, string> = {
    ...headerParams,
    appId: APP_ID,
    language: LANGUAGE,
    gaid: GAID,
    androidId: ANDROID_ID,
    sign,
    'Content-Type': 'application/json',
  };

  let url = endpointUrl(endpoint);
  const init: RequestInit = { method, headers, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (method === 'GET') {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(bodyParams)) qs.append(k, String(v));
    if (qs.toString()) url += `?${qs.toString()}`;
  } else {
    init.body = JSON.stringify(bodyParams);
  }

  try {
    const resp = await fetch(url, init);
    const text = await resp.text();
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object'
        ? { ...parsed, httpStatus: resp.status }
        : { code: -1, msg: text, httpStatus: resp.status };
    } catch {
      return { code: -1, msg: text || `HTTP ${resp.status}`, httpStatus: resp.status };
    }
  } catch (err) {
    return { code: -1, msg: `Network/Http Error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export interface PaymentTool {
  toolName?: string;
  toolType?: unknown;
  upiAddr?: string | null;
  account?: string | null;
  toolAccount?: string | null;
  [k: string]: unknown;
}

export async function selectPaymentTool(input: {
  keys: AppKeys;
  token: string;
  preferredToolName?: string;
}): Promise<{ tool: PaymentTool | null; error: string | null }> {
  const res = await apiRequest('/api/tool/mylist', {}, input.keys, input.token, 'GET');
  if (!isSuccess(res)) {
    return { tool: null, error: res?.msg || 'Failed to fetch payment tools.' };
  }
  const tools: PaymentTool[] = Array.isArray(res.data) ? res.data : [];
  if (tools.length === 0) return { tool: null, error: 'No payment tools found on account.' };

  const norm = (s: unknown) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const preferred = input.preferredToolName;
  if (preferred && preferred.toLowerCase() !== 'any') {
    const hit = tools.find((t) => norm(t.toolName).includes(norm(preferred)));
    if (hit) return { tool: hit, error: null };
  }
  const fc = tools.find((t) => norm(t.toolName) === 'freecharge');
  return { tool: fc || tools[0], error: null };
}

// The grab-list / grab endpoints may carry a rotating date suffix. Default is
// the plain path (what the live site calls); the suffix is only used if the
// API stops resolving the plain path and the Swagger docs advertise one.
let cachedGrabDate: string = import.meta.env.VITE_INCOIN_GRAB_DATE || '';

const grabListPath = () => (cachedGrabDate ? `/api/order/grablist${cachedGrabDate}` : '/api/order/grablist');
const grabPath = () => (cachedGrabDate ? `/api/order/grab${cachedGrabDate}` : '/api/order/grab');

function isRouteError(res: ApiResponse | null | undefined): boolean {
  if (!res) return false;
  if (res.httpStatus === 404 || res.httpStatus === 405) return true;
  const code = String(res.code ?? '');
  return code === '404' || code === '405' || /method is not supported/i.test(String(res.msg ?? ''));
}

// Returns true only if the cached date actually changed (so we never retry
// the same dead path, and a business "not found" can't cause a loop).
async function discoverGrabDate(): Promise<boolean> {
  try {
    const resp = await fetch(endpointUrl('/v2/api-docs'), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const docs = await resp.json();
    for (const p of Object.keys(docs?.paths || {})) {
      const m = p.match(/\/api\/order\/(?:grablist|grab)(\d{8})$/);
      if (m && m[1] !== cachedGrabDate) {
        cachedGrabDate = m[1];
        console.warn(`[incoin] Grab endpoints now use date ${cachedGrabDate}`);
        return true;
      }
    }
  } catch (err) {
    console.warn('[incoin] Could not discover grab endpoints:', err);
  }
  return false;
}

function extractTaskRecords(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.records)) return data.records;
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(data.tasks)) return data.tasks;
  return [];
}

export async function fetchTaskList(input: {
  keys: AppKeys;
  token: string;
}): Promise<{ tasks: any[]; error: string | null; authExpired?: boolean }> {
  const body = { page: 1, size: 50, data: {} };
  let res = await apiRequest(grabListPath(), body, input.keys, input.token, 'POST');
  if (isRouteError(res) && (await discoverGrabDate())) {
    res = await apiRequest(grabListPath(), body, input.keys, input.token, 'POST');
  }
  if (res.httpStatus === 401 || String(res.code) === '401') {
    return { tasks: [], error: res.msg || 'Session expired', authExpired: true };
  }
  if (!isSuccess(res)) return { tasks: [], error: res.msg || JSON.stringify(res) };
  return { tasks: extractTaskRecords(res.data), error: null };
}

export async function initializeTask(input: {
  taskId: unknown;
  tool: PaymentTool;
  keys: AppKeys;
  token: string;
}): Promise<ApiResponse> {
  const t = input.tool;
  const upi = t.upiAddr ?? t.account ?? t.toolAccount;
  const body = { orderId: input.taskId, toolType: t.toolType, upiAddr: upi };

  let res = await apiRequest(grabPath(), body, input.keys, input.token, 'POST');
  if (isRouteError(res) && (await discoverGrabDate())) {
    res = await apiRequest(grabPath(), body, input.keys, input.token, 'POST');
  }
  return res;
}

export function verifyTask(input: { taskId: unknown; keys: AppKeys; token: string }): Promise<ApiResponse> {
  return apiRequest('/api/order/machine/review', { orderId: input.taskId }, input.keys, input.token, 'POST');
}
