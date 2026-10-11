import { getToken, clearSession, getActiveProvider } from './storage';
import * as incoinBrowser from './incoinBrowser';
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
      try {
        const result = await incoinBrowser.fetchCaptcha();
        return { ...result, provider: 'incoin' };
      } catch {
        return request<CaptchaResult>(`/incoin/captcha?provider=incoin`);
      }
    }
    return request<CaptchaResult>(`/incoin/captcha?provider=${encodeURIComponent(p)}`);
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
      if (provider === 'incoin') {
        const keys = await incoinBrowser.fetchAppKeys();
        const loginResult = await incoinBrowser.login({
          appKey: keys.key,
          appSecret: keys.secret,
          username: input.username,
          password: input.password,
          captchaCode: input.captchaCode,
          captchaToken: input.captchaToken,
        });
        if (!loginResult.success) {
          return { success: false, error: loginResult.error || 'Login failed.' };
        }
        return await request<ConnectResult>('/incoin/connect', {
          method: 'POST',
          body: JSON.stringify({
            username: input.username,
            authToken: loginResult.token,
            provider,
          }),
        });
      }
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
      const provider = getActiveProvider() || 'incoin';
      // Incoin's public edge may return a route-level 404 to server-origin requests.
      const appKeys = provider === 'incoin'
        ? await incoinBrowser.fetchAppKeys()
        : null;
      return await request('/incoin/start', {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          provider,
          ...(appKeys && { appKeys }),
        }),
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
