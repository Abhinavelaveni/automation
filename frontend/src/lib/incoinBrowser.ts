const BASE_URL = new URL(
  import.meta.env.VITE_INCOIN_BASE_URL || 'https://api.incoinpay.net',
).origin;

function endpointUrl(path: string): string {
  return new URL(path, `${BASE_URL}/`).toString();
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
