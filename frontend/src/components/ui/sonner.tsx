import { useEffect, useState } from 'react';
import { X, CheckCircle2, Info, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastKind = 'error' | 'success' | 'info';

interface ToastItem {
  id: number;
  icon: ToastKind;
  message: string;
}

let nextId = 1;
let pushToast: ((message: string, icon?: ToastKind) => void) | null = null;

export function toast(message: string, icon: ToastKind = 'error') {
  pushToast?.(message, icon);
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    pushToast = (message, icon = 'error') => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, icon, message }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className={cn(
            'pointer-events-auto flex w-[360px] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg border bg-popover p-3 text-sm shadow-lg',
          )}
        >
          <span className="mt-0.5 text-muted-foreground">
            {t.icon === 'success' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : t.icon === 'info' ? (
              <Info className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
          </span>
          <span className="flex-1 leading-5">{t.message}</span>
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
