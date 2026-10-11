import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Zap } from 'lucide-react';
import { AppHeader, BackButton, Page } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/context/auth';
import { api } from '@/lib/api';
import type { TaskLog } from '@/lib/types';
import { buildUsageStats, type UsageStats } from '@/lib/usageStats';
import { UsageAnalytics } from '@/components/charts/UsageAnalytics';
import { formatDateMedium, formatTime } from '@/lib/format';

export default function OrderLogsScreen() {
  const { logs, refresh } = useAuth();
  const [loading, setLoading] = useState(true);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);

  const loadUsage = () => {
    setUsageError(null);
    api
      .getTaskLogs()
      .then((l) => setUsageStats(buildUsageStats(l)))
      .catch(() => setUsageError('Failed to load analytics.'));
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    loadUsage();
  }, []);

  return (
    <>
      <AppHeader title="Task History" leading={<BackButton />} />
      <Page wide>
        <UsageAnalytics stats={usageStats} loading={!usageStats && !usageError} error={usageError} onRetry={loadUsage} wide />
        <div className="mt-8">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">No history found</p>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date &amp; Time</TableHead>
                    <TableHead className="text-center">Tasks</TableHead>
                    <TableHead className="text-right">Usage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log, i) => (
                    <LogItem key={log.id || i} log={log} />
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      </Page>
    </>
  );
}

function LogItem({ log }: { log: TaskLog }) {
  const date = new Date(log.createdAt);
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{formatDateMedium(date)}</div>
        <div className="text-xs text-muted-foreground">{formatTime(date)}</div>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-center gap-1.5 font-medium">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {log.ordersCount}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1.5 font-medium">
          <Zap className="h-3.5 w-3.5" />
          -{log.creditsUsed}
        </div>
      </TableCell>
    </TableRow>
  );
}
