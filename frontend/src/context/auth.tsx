import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '../lib/api';
import {
  clearSession,
  getSessionUser,
  getToken,
  setSession,
  clearActiveProvider,
  getActiveProvider,
  setActiveProvider,
} from '../lib/storage';
import type { AuthResponse, TaskLog, User } from '../lib/types';

interface AuthContextValue {
  user: User | null;
  credits: number;
  logs: TaskLog[];
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: {
    email: string;
    password: string;
    fullName: string;
    state: string;
    incoinUsername: string;
  }) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function hydrateUser(): User | null {
  const raw = getSessionUser() as User | null;
  return raw && raw.id ? raw : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(hydrateUser);
  const [credits, setCredits] = useState<number>(0);
  const [logs, setLogs] = useState<TaskLog[]>([]);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setCredits(0);
      setLogs([]);
      return;
    }
    const [profile, balance, taskLogs] = await Promise.all([
      api.getProfile().catch(() => null),
      api.getCredits().catch(() => 0),
      api.getTaskLogs().catch(() => []),
    ]);
    if (profile && profile.user) {
      setUser({ ...(getSessionUser() as User | null), ...profile.user });
      if (
        !getActiveProvider() &&
        (profile.user.activeProvider === 'incoin' || profile.user.activeProvider === 'pakkago')
      ) {
        setActiveProvider(profile.user.activeProvider);
      }
    }
    setCredits(balance);
    setLogs(taskLogs);
  }, []);

  useEffect(() => {
    if (getToken()) refresh();
  }, [refresh]);

  const applyAuth = (res: AuthResponse): User => {
    setSession(res.token, res.user);
    setUser(res.user);
    refresh();
    return res.user;
  };

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password });
    return applyAuth(res);
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; fullName: string; state: string; incoinUsername: string }) => {
      const res = await api.register(input);
      return applyAuth(res);
    },
    [],
  );

  const logout = useCallback(() => {
    clearSession();
    clearActiveProvider();
    setUser(null);
    setCredits(0);
    setLogs([]);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, credits, logs, isAuthenticated: !!user, login, register, logout, refresh }),
    [user, credits, logs, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
