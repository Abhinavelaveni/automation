const TOKEN_KEY = 'incoin_token';
const USER_KEY = 'incoin_user';
const THEME_KEY = 'incoin_theme';
const PROVIDER_KEY = 'incoin_provider';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, user: unknown): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getSessionUser(): unknown | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(PROVIDER_KEY);
}

export function getActiveProvider(): 'incoin' | 'pakkago' | null {
  const stored = localStorage.getItem(PROVIDER_KEY);
  return stored === 'incoin' || stored === 'pakkago' ? stored : null;
}

export function setActiveProvider(provider: 'incoin' | 'pakkago'): void {
  localStorage.setItem(PROVIDER_KEY, provider);
}

export function clearActiveProvider(): void {
  localStorage.removeItem(PROVIDER_KEY);
}

export function getThemeMode(): 'light' | 'dark' {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'dark';
}

export function setThemeMode(mode: 'light' | 'dark'): void {
  localStorage.setItem(THEME_KEY, mode);
}

let deviceId: string | null = null;

export function getDeviceId(): string {
  if (deviceId) return deviceId;
  const existing = localStorage.getItem('incoin_device_id');
  if (existing) {
    deviceId = existing;
    return existing;
  }
  const ua = navigator.userAgent || '';
  const lang = navigator.language || '';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const id = `web_${ua}_${lang}_${tz}`;
  deviceId = id;
  localStorage.setItem('incoin_device_id', id);
  return id;
}
