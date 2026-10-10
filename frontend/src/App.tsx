import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/auth';
import { ThemeProvider } from './context/theme';
import { ToastProvider } from './context/toast';
import { api } from './lib/api';
import { getActiveProvider } from './lib/storage';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import VerifyEmailScreen from './screens/EmailVerificationScreen';
import DashboardScreen from './screens/DashboardScreen';
import ConnectIncoinScreen from './screens/ConnectIncoinScreen';
import OrderLogsScreen from './screens/OrderLogsScreen';
import ContactScreen from './screens/ContactScreen';
import SelectServiceScreen from './screens/SelectServiceScreen';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireGuest({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/select-service" replace />;
  return <>{children}</>;
}

function RequireService({ children }: { children: React.ReactNode }) {
  const provider = getActiveProvider();
  if (!provider) return <Navigate to="/select-service" replace />;
  return <>{children}</>;
}

function RequireWorkspace({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'ok' | 'reconnect' | 'pick'>('loading');

  useEffect(() => {
    let active = true;
    const provider = getActiveProvider();
    if (!provider) {
      setState('pick');
      return;
    }
    api
      .getEngineState(provider)
      .then((s) => {
        if (!active) return;
        setState(s.connected ? 'ok' : 'reconnect');
      })
      .catch(() => {
        if (active) setState('reconnect');
      });
    return () => {
      active = false;
    };
  }, []);

  if (state === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (state === 'pick') return <Navigate to="/select-service" replace />;
  if (state === 'reconnect') return <Navigate to="/connect-incoin" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<RequireGuest><LoginScreen /></RequireGuest>} />
      <Route path="/register" element={<RequireGuest><RegisterScreen /></RequireGuest>} />
      <Route path="/verify-email" element={<VerifyEmailScreen />} />
      <Route path="/select-service" element={<RequireAuth><SelectServiceScreen /></RequireAuth>} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <RequireService>
              <RequireWorkspace>
                <DashboardScreen />
              </RequireWorkspace>
            </RequireService>
          </RequireAuth>
        }
      />
      <Route
        path="/connect-incoin"
        element={
          <RequireAuth>
            <RequireService>
              <ConnectIncoinScreen />
            </RequireService>
          </RequireAuth>
        }
      />
      <Route
        path="/order-logs"
        element={
          <RequireAuth>
            <RequireService>
              <OrderLogsScreen />
            </RequireService>
          </RequireAuth>
        }
      />
      <Route path="/contact" element={<RequireAuth><ContactScreen /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
