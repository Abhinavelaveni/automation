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
