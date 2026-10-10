import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { UsageStats } from '@/lib/usageStats';
import { formatChartValue, formatDateMedium } from '@/lib/format';
import { ChartStateView } from './ChartStateView';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const GRID = 'var(--border)';
const AXIS = 'var(--muted-foreground)';

interface ChartTooltipProps {
  active?: boolean;
  payload?: any[];
  valueKey: 'tasks' | 'credits';
  valueName: string;
}

function ChartTooltip({ active, payload, valueKey, valueName }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <div className="mb-1 font-medium text-muted-foreground">{formatDateMedium(point.date)}</div>
      <div className="flex gap-1.5 font-semibold">
        <span className="text-muted-foreground">{valueName}:</span>
        <span>{formatChartValue(point[valueKey])}</span>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  headerValue,
  legendLabel,
  legendValue,
  color,
  chart,
  height = 180,
  state,
  onRetry,
}: {
  title: string;
  headerValue: string;
  legendLabel: string;
  legendValue: string;
  color: string;
  chart: React.ReactNode;
  height?: number;
  state: { loading: boolean; error: string | null; empty: boolean };
  onRetry?: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-end justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</CardTitle>
        <div className="text-2xl font-semibold tabular-nums">{headerValue}</div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
          <span className="text-muted-foreground">{legendLabel}</span>
          <span className="font-semibold">{legendValue}</span>
        </div>
        <div style={{ height }} className="w-full">
          {state.loading ? (
            <ChartStateView isLoading message="Loading analytics..." />
          ) : state.error ? (
            <ChartStateView message={state.error} onRetry={onRetry} />
          ) : state.empty ? (
            <ChartStateView message="No activity recorded yet" />
          ) : (
            chart
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function UsageAnalytics({
  stats,
  loading,
  error,
  onRetry,
  wide = false,
  embedded = false,
}: {
  stats: UsageStats | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  wide?: boolean;
  embedded?: boolean;
}) {
  const tasksColor = 'var(--chart-1)';
  const creditsColor = 'var(--chart-2)';
  const commonState = {
    loading: loading && !stats,
    error,
    empty: !loading && !error && stats != null && stats.totalTasks === 0 && stats.totalCreditsUsed === 0,
  };

  const tasksCard = (
    <ChartCard
      title="Tasks completed"
      headerValue={`${stats?.totalTasks ?? 0}`}
      legendLabel="Tasks"
      legendValue={`${stats?.totalTasks ?? 0}`}
      color={tasksColor}
      state={commonState}
      onRetry={onRetry}
      chart={
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats?.data ?? []} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS }} dy={8} interval={0} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS }} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltip valueKey="tasks" valueName="Tasks" />} />
            <Bar dataKey="tasks" fill={tasksColor} radius={[4, 4, 0, 0]} maxBarSize={36}>
              {(stats?.data ?? []).map((_, i) => (
                <Cell key={i} fill={tasksColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      }
    />
  );

  const creditsCard = (
    <ChartCard
      title="Credits used"
      headerValue={`${stats?.totalCreditsUsed ?? 0}`}
      legendLabel="Credits"
      legendValue={`${stats?.totalCreditsUsed ?? 0}`}
      color={creditsColor}
      state={commonState}
      onRetry={onRetry}
      chart={
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={stats?.data ?? []} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="creditsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={creditsColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={creditsColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS }} dy={8} interval={0} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS }} allowDecimals={false} />
            <Tooltip content={<ChartTooltip valueKey="credits" valueName="Credits" />} />
            <Area type="monotone" dataKey="credits" stroke={creditsColor} strokeWidth={2} fill="url(#creditsFill)" />
          </AreaChart>
        </ResponsiveContainer>
      }
    />
  );

  return (
    <div>
      {!embedded && (
        <div className="mb-4">
          <h3 className="text-lg font-semibold tracking-tight">Usage analytics</h3>
          <p className="text-sm text-muted-foreground">Your activity over the last 7 days</p>
        </div>
      )}
      <div className={cn('grid gap-4', wide ? 'md:grid-cols-2' : 'grid-cols-1')}>
        {tasksCard}
        {creditsCard}
      </div>
    </div>
  );
}
