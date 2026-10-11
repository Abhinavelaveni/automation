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
  const url = `${BASE_URL}/anon/test/getCaptcha`;
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
  const url = `${BASE_URL}/anon/client/checkVersion`;
  console.log('[incoin] Fetching app keys from', url);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'GET',
      headers: baseHeaders(),
      cache: 'no-store',
    });
    console.log('[incoin] App keys response status:', resp.status);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[incoin] App keys fetch network error:', errorMsg);
    throw new Error(
      `Incoin initialization request could not reach api.incoinpay.net. Error: ${errorMsg}. Check your connection and browser cross-origin access.`,
    );
  }

  const responseText = await resp.text();
  const responseDetail = responseText.replace(/\s+/g, ' ').slice(0, 200);

  if (!resp.ok) {
    console.error('[incoin] App keys response not OK', {
      status: resp.status,
      detail: responseDetail,
    });
    const detail = responseDetail ? ` Response: ${responseDetail}` : '';
    throw new Error(
      `Incoin initialization request returned HTTP ${resp.status} from api.incoinpay.net/anon/client/checkVersion.${detail}`,
    );
  }

  let data: {
    data?: { clientKey?: unknown; clientSecret?: unknown };
    msg?: unknown;
  };
  try {
    data = JSON.parse(responseText);
    console.log('[incoin] App keys response parsed successfully');
  } catch (err) {
    console.error('[incoin] App keys response parse error:', err);
    throw new Error('Incoin initialization returned an invalid response.');
  }

  if (typeof data?.data?.clientKey !== 'string' || typeof data?.data?.clientSecret !== 'string') {
    console.error('[incoin] App keys missing in response:', {
      hasData: !!data?.data,
      hasKey: typeof data?.data?.clientKey,
      hasSecret: typeof data?.data?.clientSecret,
      msg: data?.msg,
    });
    throw new Error(
      typeof data?.msg === 'string'
        ? data.msg
        : 'Incoin initialization response did not include service keys.',
    );
  }

  console.log('[incoin] App keys fetched successfully');
  return { key: data.data.clientKey, secret: data.data.clientSecret };
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
    console.log('[incoin] Starting login flow for user:', input.username);

    const timestamp = String(Date.now());
    const body = {
      userName: input.username,
      passwd: input.password,
      captcha: input.captchaCode,
      captchaToken: input.captchaToken,
    };

    console.log('[incoin] Login request body prepared:', {
      userName: body.userName,
      captchaLength: body.captcha.length,
      captchaTokenLength: body.captchaToken.length,
    });

    const headerParams = {
      timestamp,
      version: APP_VERSION,
      OSVersion: OS_VERSION,
      clientKey: input.appKey,
      clientType: CLIENT_TYPE,
    };

    const sign = await generateSign(body, headerParams, input.appSecret);
    console.log('[incoin] HMAC signature generated:', sign.slice(0, 16) + '...');

    const headers = baseHeaders({ clientKey: input.appKey, sign, timestamp });
    console.log('[incoin] Login request headers prepared');

    console.log('[incoin] Sending login request to', `${BASE_URL}/anon/login`);
    const resp = await fetch(`${BASE_URL}/anon/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    console.log('[incoin] Login response status:', resp.status);

    let data: any;
    const respText = await resp.text();
    try {
      data = JSON.parse(respText);
    } catch {
      console.error('[incoin] Login response parse error, raw text:', respText.slice(0, 200));
      return { success: false, error: `Invalid response from server: ${respText.slice(0, 100)}` };
    }

    console.log('[incoin] Login response code:', data?.code, 'msg:', data?.msg);

    const code = data?.code;
    if (code === 0 || code === '0' || code === '000000') {
      const token = data?.data?.token;
      if (token) {
        console.log('[incoin] Login successful, token received');
        return { success: true, token };
      }
      console.error('[incoin] Login code success but no token in response');
      return { success: false, error: 'Login succeeded but no token was returned.' };
    }

    const errorMsg = data?.msg || 'Login failed';
    console.error('[incoin] Login failed with code', code, ':', errorMsg);
    return { success: false, error: errorMsg };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[incoin] Login network error:', errorMsg);
    return { success: false, error: `Network error: ${errorMsg}` };
  }
}
