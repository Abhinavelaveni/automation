import { BarChart3, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ChartStateView({
  isLoading,
  message,
  onRetry,
}: {
  isLoading?: boolean;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <BarChart3 className="h-8 w-8 opacity-60" />}
      {message && <div className="text-center">{message}</div>}
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      )}
    </div>
  );
}
