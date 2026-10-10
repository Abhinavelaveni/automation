import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Layers, Loader2, LogOut } from 'lucide-react';
import { AppHeader, Page, ThemeToggle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/context/auth';
import { useToast } from '@/context/toast';
import { api } from '@/lib/api';
import { setActiveProvider } from '@/lib/storage';
import { SERVICES, type ServiceId } from '@/lib/services';
import type { ServiceSummary } from '@/lib/types';

export default function SelectServiceScreen() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<ServiceId | null>(null);
  const [services, setServices] = useState<ServiceSummary[]>([]);

  useEffect(() => {
    let active = true;
    api
      .getServices()
      .then((res) => {
        if (!active) return;
        setServices(res.services || []);
      })
      .catch(() => {
        if (active) setServices([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const choose = async (id: ServiceId) => {
    setBusy(id);
    try {
      const result = await api.selectService(id);
      setActiveProvider(id);
      if (result.connected) {
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/connect-incoin', { replace: true });
      }
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <AppHeader
        title="Choose workspace"
        trailing={
          <>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                logout();
                navigate('/login');
              }}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        }
      />
      <Page wide>
        <div className="mb-8 space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Select a service</h2>
          <p className="text-muted-foreground">
            Continue with Incoin or PakkaGo. You can switch workspaces anytime from the dashboard.
          </p>
          {user?.email && <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>}
        </div>

        {loading ? (
          <div className="flex min-h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {SERVICES.map((svc) => {
              const summary = services.find((s) => s.id === svc.id);
              const connected = !!summary?.connected;
              const isBusy = busy === svc.id;
              return (
                <button
                  key={svc.id}
                  disabled={!!busy}
                  onClick={() => choose(svc.id)}
                  className="flex items-start gap-4 rounded-xl border bg-card p-5 text-left shadow-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                    {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Layers className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{svc.title}</div>
                      {connected && (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Connected
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{svc.subtitle}</p>
                    {summary?.username && (
                      <p className="mt-2 text-xs text-muted-foreground">Workspace {summary.username}</p>
                    )}
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        )}

        <Alert className="mt-6">
          <Layers className="h-4 w-4" />
          <AlertDescription>
            Each service uses its own credentials and session. Connecting one does not replace the other.
          </AlertDescription>
        </Alert>
      </Page>
    </>
  );
}
