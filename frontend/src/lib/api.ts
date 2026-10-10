import { getToken, clearSession, getActiveProvider } from './storage';
import type {
  AuthResponse,
  CaptchaResult,
  ConnectResult,
  EngineState,
  ProfileResponse,
  ReferralStatus,
  TaskLog,
  User,
  WorkspaceSelectResult,
} from './types';

const BASE = '/api';

const kServerUnavailableMessage =
  'Server not available. Please check your connection and try again.';

<<<<<<< HEAD
=======
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

>>>>>>> 6cd84533374874f14d8d61edb5b0ead7d1447b1c
async function fetchIncoinAppKeys(): Promise<{ key: string; secret: string }> {
  const response = await fetch('https://api.incoinpay.net/anon/client/checkVersion', {
    headers: {
      timestamp: String(Date.now()),
      version: '46',
      OSVersion: '30',
      clientKey: '',
      clientType: 'Android',
      appId: 'xyz.indianx.app',
      language: 'en',
      gaid: 'd802a45a-8b82-45a7-932f-abcdef123456',
      androidId: 'a1b2c3d4e5f6g7h8',
      sign: '',
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Incoin service keys request failed (${response.status}).`);
  }
  const data = await response.json();
  const keys = data?.data;
  if (
    (data?.code !== 0 && data?.code !== '0' && data?.code !== '000000') ||
    typeof keys?.clientKey !== 'string' ||
    typeof keys?.clientSecret !== 'string' ||
    !keys.clientKey ||
    !keys.clientSecret
  ) {
    throw new Error(data?.msg || 'Incoin service keys are unavailable. Please try again.');
  }
  return { key: keys.clientKey, secret: keys.clientSecret };
}

<<<<<<< HEAD
=======
async function signIncoinRequest(
  body: Record<string, string>,
  headerParams: Record<string, string>,
  appSecret: string,
): Promise<string> {
  const entries = Object.entries({ ...body, ...headerParams });
  entries.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const message = entries
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    .map(([, value]) => String(value))
    .join('');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

>>>>>>> 6cd84533374874f14d8d61edb5b0ead7d1447b1c
function friendlyError(error: unknown): string {
  console.error('API error:', error);
  if (error instanceof TypeError) return kServerUnavailableMessage;
  if (error instanceof Error && error.message) {
    if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
      return kServerUnavailableMessage;
    }
    return error.message;
  }
  return kServerUnavailableMessage;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearSession();
  }

  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface Credentials {
  email: string;
  password: string;
}

function normalizeLogs(raw: any[]): TaskLog[] {
  return (raw || []).map((log) => ({
    id: log.id || log._id,
    ordersCount: Number(log.ordersCount ?? log.orders_count ?? 0),
    creditsUsed: Number(log.creditsUsed ?? log.credits_used ?? 0),
    createdAt: log.createdAt || log.created_at,
  }));
}

export const api = {
  // ── Auth ────────────────────────────────────────────────────
  async register(input: {
    email: string;
    password: string;
    fullName: string;
    state: string;
    incoinUsername: string;
  }): Promise<AuthResponse> {
    try {
      return await request<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      }, false);
    } catch (e) {
      throw new Error(friendlyError(e));
    }
  },

  async login(input: Credentials): Promise<AuthResponse> {
    try {
      return await request<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      }, false);
    } catch (e) {
      throw new Error(friendlyError(e));
    }
  },

  // ── Credits & logs ──────────────────────────────────────────
  async getCredits(): Promise<number> {
    const data = await request<{ balance: number }>('/credits');
    return Number(data.balance || 0);
  },

  // ── Profile ───────────────────────────────────────
  async getProfile(): Promise<ProfileResponse> {
    try {
      return await request<ProfileResponse>('/me');
    } catch (e) {
      throw new Error(friendlyError(e));
    }
  },

  async updateUserSettings(tasksPerRun: number): Promise<{ success: boolean; tasksPerRun?: number; taskLimit?: number; error?: string }> {
    try {
      return await request('/user/settings', {
        method: 'PATCH',
        body: JSON.stringify({ tasksPerRun }),
      });
    } catch (e) {
      const err = e as Error;
      return {
        success: false,
        error: err.message || 'Failed to update settings.',
      };
    }
  },

  async getTaskLogs(): Promise<TaskLog[]> {
    try {
      const data = await request<{ logs: any[] }>('/logs');
      return normalizeLogs(data.logs);
    } catch (e) {
      throw new Error(friendlyError(e));
    }
  },

  async addTaskLog(tasksCount: number, creditsUsed: number): Promise<void> {
    try {
      await request('/logs', {
        method: 'POST',
        body: JSON.stringify({ tasksCount, creditsUsed }),
      });
    } catch (e) {
      console.error('Error logging task:', e);
    }
  },

  // ── Referrals ───────────────────────────────────────────────
  async referralStatus(): Promise<ReferralStatus> {
    return request<ReferralStatus>('/referrals/status');
  },

  async uploadReferralScreenshot(file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const data = await request<{ url: string }>('/uploads/referral', {
      method: 'POST',
      body: form,
    });
    return data.url;
  },

  async submitReferralApplication(imageUrls: string[]): Promise<void> {
    await request('/referrals/apply', {
      method: 'POST',
      body: JSON.stringify({ imageUrls, status: 'pending' }),
    });
  },

  // ── Devices ─────────────────────────────────────────────────
  async isDeviceRegistered(deviceId: string): Promise<boolean> {
    try {
      const data = await request<{ registered: boolean }>(
        `/devices/registered/${encodeURIComponent(deviceId)}`,
        {},
        false,
      );
      return !!data.registered;
    } catch {
      return false;
    }
  },

  async registerDevice(deviceId: string): Promise<void> {
    try {
      await request('/devices/register', {
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      });
    } catch (e) {
      console.error('Error registering device:', e);
    }
  },

  // ── Workspace / service selection ───────────────────────────
  async getServices(): Promise<{ activeProvider: 'incoin' | 'pakkago' | null; services: EngineState['services'] }> {
    try {
      return await request('/workspace/services');
    } catch {
      return { activeProvider: getActiveProvider(), services: [] };
    }
  },

  async selectService(provider: 'incoin' | 'pakkago'): Promise<WorkspaceSelectResult> {
    return request<WorkspaceSelectResult>('/workspace/select', {
      method: 'POST',
      body: JSON.stringify({ provider }),
    });
  },

  // ── Incoin / PakkaGo engine (server-side) ───────────────────
  async fetchCaptcha(provider?: 'incoin' | 'pakkago'): Promise<CaptchaResult> {
    const p = provider || getActiveProvider() || 'incoin';
    if (p === 'incoin') {
      const response = await fetch('https://api.incoinpay.net/anon/test/getCaptcha');
      if (!response.ok) {
        throw new Error(`Incoin captcha request failed (${response.status}).`);
      }
      const captchaToken = response.headers.get('captchaToken');
      if (!captchaToken) {
        throw new Error('Incoin did not return a captcha token.');
      }
      const image = await response.arrayBuffer();
      if (!image.byteLength) {
        throw new Error('Incoin returned an empty captcha image.');
      }
      return {
        captchaToken,
        imageBase64: arrayBufferToBase64(image),
        provider: p,
      };
    }
    return request<CaptchaResult>(`/incoin/captcha?provider=${encodeURIComponent(p)}`);
  },

  async getIncoinAppKeys(): Promise<{ key: string; secret: string }> {
    try {
      return await fetchIncoinAppKeys();
    } catch (e) {
      throw new Error(friendlyError(e));
    }
  },

  async connectIncoin(input: {
    username: string;
    password: string;
    captchaCode: string;
    captchaToken: string;
    provider?: 'incoin' | 'pakkago';
  }): Promise<ConnectResult> {
    try {
      const provider = input.provider || getActiveProvider() || 'incoin';
<<<<<<< HEAD
=======
      if (provider === 'incoin') {
        const keys = await fetchIncoinAppKeys();
        const timestamp = String(Date.now());
        const body = {
          userName: input.username,
          passwd: input.password,
          captcha: input.captchaCode,
          captchaToken: input.captchaToken,
        };
        const headerParams = {
          timestamp,
          version: '46',
          OSVersion: '30',
          clientKey: keys.key,
          clientType: 'Android',
        };
        const sign = await signIncoinRequest(body, headerParams, keys.secret);
        const loginResponse = await fetch('https://api.incoinpay.net/anon/login', {
          method: 'POST',
          headers: {
            ...headerParams,
            appId: 'xyz.indianx.app',
            language: 'en',
            gaid: 'd802a45a-8b82-45a7-932f-abcdef123456',
            androidId: 'a1b2c3d4e5f6g7h8',
            sign,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        const responseText = await loginResponse.text();
        let loginData: any;
        try {
          loginData = JSON.parse(responseText);
        } catch {
          throw new Error(`Incoin returned an unexpected response (HTTP ${loginResponse.status}).`);
        }
        const successCode =
          loginData?.code === 0 || loginData?.code === '0' || loginData?.code === '000000';
        const incoinToken = loginData?.data?.token;
        if (!loginResponse.ok || !successCode || typeof incoinToken !== 'string' || !incoinToken) {
          return {
            success: false,
            error: loginData?.msg || `Incoin login failed (HTTP ${loginResponse.status}).`,
          };
        }
        return await request<ConnectResult>('/incoin/connect', {
          method: 'POST',
          body: JSON.stringify({ username: input.username, provider, incoinToken }),
        });
      }
>>>>>>> 6cd84533374874f14d8d61edb5b0ead7d1447b1c
      return await request<ConnectResult>('/incoin/connect', {
        method: 'POST',
        body: JSON.stringify({ ...input, provider }),
      });
    } catch (e) {
      return { success: false, error: friendlyError(e) };
    }
  },

  async getEngineState(provider?: 'incoin' | 'pakkago'): Promise<EngineState> {
    try {
      const p = provider || getActiveProvider();
      const qs = p ? `?provider=${encodeURIComponent(p)}` : '';
      return await request<EngineState>(`/incoin/state${qs}`);
    } catch {
      return { connected: false, running: false, progress: 0, status: '', processed: 0 };
    }
  },

  async startEngine(input: {
    minAmount: number;
    maxAmount: number;
    targetCount: number;
    preferredToolName: string;
  }): Promise<{ success: boolean; runId?: string; taskLimit?: number; error?: string }> {
    try {
      return await request('/incoin/start', {
        method: 'POST',
        body: JSON.stringify({ ...input, provider: getActiveProvider() || 'incoin' }),
      });
    } catch (e) {
      return { success: false, error: friendlyError(e) };
    }
  },

  async stopEngine(): Promise<{ success: boolean }> {
    try {
      return await request('/incoin/stop', { method: 'POST' });
    } catch {
      return { success: false };
    }
  },
};

export type Api = typeof api;
export type { User };
