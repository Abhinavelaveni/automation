import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { X, CheckCircle2, Info, AlertCircle } from 'lucide-react';

interface ToastItem {
  id: number;
  icon: 'error' | 'success' | 'info';
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, icon?: ToastItem['icon']) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
  dismiss: () => {},
});

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, icon: ToastItem['icon'] = 'error') => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, icon, message }]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast, dismiss }), [showToast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className="pointer-events-auto flex w-[360px] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg border bg-popover p-3 text-sm shadow-lg"
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
            <button className="text-muted-foreground hover:text-foreground" onClick={() => dismiss(t.id)} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
