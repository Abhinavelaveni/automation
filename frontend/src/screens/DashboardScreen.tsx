import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Clock,
  Gift,
  History,
  Info,
  Layers,
  Loader2,
  LogOut,
  Mail,
  Phone,
  Settings,
  SlidersHorizontal,
  Square,
  CheckCircle2,
  Wifi,
  Zap,
} from 'lucide-react';
import { AppHeader, ThemeToggle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/auth';
import { useToast } from '@/context/toast';
import { useEngineStream } from '@/lib/useEngineStream';
import { api } from '@/lib/api';
import { resolveTaskLimit, planLabel } from '@/lib/limits';
import type { TaskResult } from '@/lib/types';
import { buildUsageStats, type UsageStats } from '@/lib/usageStats';
import { UsageAnalytics } from '@/components/charts/UsageAnalytics';
import ReferralBottomSheet from '@/components/ReferralBottomSheet';
import { getActiveProvider } from '@/lib/storage';
import { serviceMeta } from '@/lib/services';

interface SettingsState {
  minComplexity: number;
  maxComplexity: number;
  targetCount: number;
  preferredToolName: string;
}

const TOOL_OPTIONS = [
  { value: 'Freecharge', label: 'Freecharge' },
  { value: 'Mobikwik', label: 'Mobikwik' },
  { value: 'AmazonPay', label: 'AmazonPay' },
  { value: 'Paytm', label: 'Paytm' },
  { value: 'Any', label: 'Any' },
];

export default function DashboardScreen() {
  const navigate = useNavigate();
  const { user, credits, logs, logout, refresh } = useAuth();
  const { showToast } = useToast();
  const engine = useEngineStream();
  const provider = getActiveProvider() || 'incoin';
  const meta = serviceMeta(provider);
  const taskLimit = resolveTaskLimit(user?.taskLimit);

  const [settings, setSettings] = useState<SettingsState>({
    minComplexity: 100,
    maxComplexity: 0,
    targetCount: taskLimit,
    preferredToolName: 'Mobikwik',
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [result, setResult] = useState<TaskResult | null>(null);
  const [showReferral, setShowReferral] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);

  useEffect(() => {
    setSettings((s) => ({ ...s, targetCount: taskLimit }));
  }, [taskLimit]);

  const loadUsage = () => {
    setUsageLoading(true);
    setUsageError(null);
    api
      .getTaskLogs()
      .then((taskLogs) => {
        setUsageStats(buildUsageStats(taskLogs));
        setUsageLoading(false);
      })
      .catch(() => {
        setUsageError('Failed to load analytics.');
        setUsageLoading(false);
      });
  };

  useEffect(() => {
    loadUsage();
    const shown = sessionStorage.getItem('incoin_referral_popup');
    if (!shown && user && user.emailConfirmedAt) {
      api.referralStatus()
        .then((s) => {
          if (!s.hasApplied) {
            setShowReferral(true);
            sessionStorage.setItem('incoin_referral_popup', '1');
          }
        })
        .catch(() => {});
    }
  }, [user]);

  const startProcessing = async () => {
    const state = await api.getEngineState(provider);
    if (!state.connected) {
      showToast('Please connect your service workspace first.', 'info');
      navigate('/connect-incoin');
      return;
    }
    if (credits <= 0) {
      showToast('Insufficient tool credits to continue.');
      return;
    }

    const userTasksPerRun = Math.min(settings.targetCount, taskLimit);
    const startResult = await engine.start(
      {
        minAmount: settings.minComplexity,
        maxAmount: settings.maxComplexity,
        targetCount: userTasksPerRun,
        preferredToolName: settings.preferredToolName,
      },
      (r) => {
        if (r.done) {
          refresh();
          setResult(r);
        }
      },
    );
    if (!startResult.success) {
      showToast(startResult.error || 'Failed to start.');
    }
  };

  const todayTasks = logs.reduce((sum, l) => sum + (l.ordersCount || 0), 0);
  const displayName = user?.fullName?.trim() || user?.email?.split('@')[0] || 'User';
  const plan = user?.plan || planLabel(taskLimit);
  const workspace =
    provider === 'pakkago' ? user?.pakkagoUsername || 'Not connected' : user?.incoinUsername || 'Not connected';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <>
      <AppHeader
        title={meta.title}
        trailing={
          <>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Settings">
              <Settings className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account menu">
                  <Mail className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate('/select-service')}>
                  <Layers className="h-4 w-4" />
                  Switch service
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/contact')}>
                  <Mail className="h-4 w-4" />
                  Contact
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <main className="mx-auto grid max-w-5xl gap-4 px-4 py-6 md:grid-cols-12">
        <Card className="md:col-span-8">
          <CardHeader>
            <CardTitle>Run processing</CardTitle>
            <CardDescription>Start or stop the current workspace run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              size="lg"
              className="w-full"
              variant={engine.running ? 'outline' : 'default'}
              onClick={engine.running ? engine.stop : startProcessing}
              disabled={credits <= 0 && !engine.running}
            >
              {engine.running ? (
                <>
                  <Square className="h-4 w-4" />
                  Stop processing
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Start processing
                </>
              )}
            </Button>
            {engine.running && (
              <div className="space-y-2">
                <Progress value={engine.progress} />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {engine.status || 'Initializing...'}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardDescription>Credits</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{credits}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardDescription>Tasks today</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{todayTasks}</CardTitle>
          </CardHeader>
        </Card>

        <Card className="md:col-span-5">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <Avatar>
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate text-base">{displayName}</CardTitle>
              <CardDescription className="truncate">{user?.email}</CardDescription>
            </div>
            <Badge variant="secondary">{plan}</Badge>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {user?.incoinPhone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span className="w-16">Incoin</span>
                <span className="ml-auto font-medium text-foreground">+91 {user.incoinPhone}</span>
              </div>
            )}
            {provider === 'pakkago' && user?.pakkagoPhone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span className="w-16">PakkaGo</span>
                <span className="ml-auto font-medium text-foreground">+91 {user.pakkagoPhone}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Layers className="h-4 w-4" />
              <span className="w-16">{meta.name}</span>
              <span className="ml-auto font-medium text-foreground">{workspace}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4" />
              <span className="w-16">Limit</span>
              <span className="ml-auto font-medium text-foreground">{taskLimit}/run</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 md:col-span-7 sm:grid-cols-3">
          <ActionTile icon={<Layers className="h-4 w-4" />} title={`${meta.name} Integration`} subtitle="Manage connection" onClick={() => navigate('/connect-incoin')} />
          <ActionTile icon={<History className="h-4 w-4" />} title="Activity History" subtitle="View logs" onClick={() => navigate('/order-logs')} />
          <ActionTile icon={<SlidersHorizontal className="h-4 w-4" />} title="Switch Service" subtitle="Choose workspace" onClick={() => navigate('/select-service')} />
        </div>

        <Card className="md:col-span-12">
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <UsageAnalytics
              stats={usageStats}
              loading={usageLoading}
              error={usageError}
              onRetry={loadUsage}
              wide={false}
              embedded
            />
          </CardContent>
        </Card>
      </main>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        taskLimit={taskLimit}
        onApply={(s) => {
          setSettings(s);
          setSettingsOpen(false);
        }}
      />

      <WelcomeReferralDialog
        open={showReferral}
        onClose={() => setShowReferral(false)}
        onClaim={() => {
          setShowReferral(false);
          setReferralOpen(true);
        }}
      />

      <ReferralBottomSheet open={referralOpen} onClose={() => setReferralOpen(false)} onApplied={() => refresh()} />

      <TaskResultDialog
        result={result}
        onClose={() => setResult(null)}
        onRelink={() => {
          setResult(null);
          navigate('/connect-incoin');
        }}
      />
    </>
  );
}

function ActionTile({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition hover:bg-accent"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">{icon}</div>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
    </button>
  );
}

function SettingsDialog({
  open,
  onClose,
  settings,
  taskLimit,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  settings: SettingsState;
  taskLimit: number;
  onApply: (s: SettingsState) => void;
}) {
  const [min, setMin] = useState(`${settings.minComplexity}`);
  const [max, setMax] = useState(settings.maxComplexity === 0 ? '' : `${settings.maxComplexity}`);
  const [tool, setTool] = useState(settings.preferredToolName);
  const [tasksPerRun, setTasksPerRun] = useState(`${settings.targetCount}`);

  useEffect(() => {
    setMin(`${settings.minComplexity}`);
    setMax(settings.maxComplexity === 0 ? '' : `${settings.maxComplexity}`);
    setTool(settings.preferredToolName);
    setTasksPerRun(`${settings.targetCount}`);
  }, [settings, open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Workflow settings</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="Min Complexity" placeholder="e.g. 100" value={min} onChange={setMin} />
          <Field label="Max Complexity (blank = any)" placeholder="e.g. 500" value={max} onChange={setMax} />
          <div className="grid gap-2">
            <Label>Tasks per Run</Label>
            <Select value={tasksPerRun} onValueChange={setTasksPerRun}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: Math.min(taskLimit, 3) }, (_, i) => (
                  <SelectItem key={i + 1} value={`${i + 1}`}>
                    {i + 1} task{i > 0 ? 's' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Preferred Connector</Label>
            <Select value={tool} onValueChange={setTool}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TOOL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const newTasksPerRun = Number(tasksPerRun) || 3;
              await api.updateUserSettings(newTasksPerRun);
              onApply({
                minComplexity: Number(min) || settings.minComplexity,
                maxComplexity: max.trim() ? Number(max) || 0 : 0,
                targetCount: newTasksPerRun,
                preferredToolName: tool,
              });
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WelcomeReferralDialog({
  open,
  onClose,
  onClaim,
}: {
  open: boolean;
  onClose: () => void;
  onClaim: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Gift className="h-8 w-8" />
        </div>
        <DialogHeader>
          <DialogTitle className="text-center">Welcome to Incoin Assistant!</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Share the app with your friends and get 50 FREE feature credits to enhance your workflow!
        </p>
        <DialogFooter className="sm:flex-col sm:space-x-0">
          <Button size="lg" className="w-full" onClick={onClaim}>
            Claim 50 Free Credits Now
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Maybe Later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskResultDialog({
  result,
  onClose,
  onRelink,
}: {
  result: TaskResult | null;
  onClose: () => void;
  onRelink: () => void;
}) {
  if (!result) return null;
  const isDailyLimit = result.logs.some(
    (l) =>
      l.toLowerCase().includes('daily limit') ||
      l.toLowerCase().includes('come back tomorrow') ||
      l.toLowerCase().includes('reach max') ||
      l.toLowerCase().includes('maximum limit'),
  );
  const displayMessage =
    !result.success && result.logs.length > 0
      ? [...result.logs].reverse().find((l) => l.startsWith('✗') || l.toLowerCase().includes('fail')) ?? result.message
      : result.message;

  return (
    <Dialog open={!!result} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {result.success ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            {result.success ? 'Process Complete' : 'Process Incomplete'}
          </DialogTitle>
        </DialogHeader>
        {isDailyLimit ? (
          <div className="grid gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              Check your internet speed
            </div>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Check tool connection
              <Button variant="link" size="sm" className="h-auto px-1" onClick={onRelink}>
                Relink
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Try after some time
            </div>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                If this message keeps appearing, your daily limit has been reached. Try again tomorrow.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="font-medium">{displayMessage}</p>
            {result.success && result.processedTasks.length > 0 && (
              <div className="rounded-lg border bg-muted/40">
                {result.processedTasks.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 border-b px-3 py-2 last:border-0">
                    <span className="flex-1 text-sm">Task ID: {t.taskId}</span>
                    <span className="text-sm font-medium">Successful</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" className="w-full" onClick={onClose}>
            Dismiss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
