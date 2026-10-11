import type { ReactNode } from 'react';
import { Moon, Sun, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/context/theme';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { isDark, toggle } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme" className={className}>
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export function AppHeader({
  title,
  leading,
  trailing,
}: {
  title?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          {leading}
          {title && <h1 className="truncate text-sm font-semibold tracking-tight">{title}</h1>}
        </div>
        <div className="flex items-center gap-1">{trailing}</div>
      </div>
    </header>
  );
}

export function BackButton({ to, onClick }: { to?: string; onClick?: () => void }) {
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Back"
      onClick={() => {
        if (onClick) onClick();
        else if (to) navigate(to);
        else navigate(-1);
      }}
    >
      <ArrowLeft className="h-4 w-4" />
    </Button>
  );
}

export function Page({
  children,
  className,
  wide,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <main className={cn('mx-auto w-full px-4 py-8', wide ? 'max-w-5xl' : 'max-w-md', className)}>
      {children}
    </main>
  );
}
