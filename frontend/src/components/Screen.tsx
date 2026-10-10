import type { ReactNode } from 'react';
import { useTheme } from '../context/theme';
import { IconChevronRight, IconMoon, IconSun } from './Icons';
import { Divider } from './ui';

export function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  return (
    <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
      {isDark ? <IconSun width={19} height={19} /> : <IconMoon width={19} height={19} />}
    </button>
  );
}

export function AppHeader({
  title,
  leading,
  trailing,
  divider = true,
}: {
  title?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  divider?: boolean;
}) {
  return (
    <>
      <header className="app-header">
        <div className="row gap-8" style={{ minWidth: 0 }}>
          {leading}
          {title && <span className="title">{title}</span>}
        </div>
        <div className="toolbar">{trailing}</div>
      </header>
      {divider && <Divider />}
    </>
  );
}

export function ActionCard({
  title,
  subtitle,
  icon,
  primary = false,
  loading = false,
  disabled = false,
  onClick,
  progress,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  primary?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  progress?: number;
}) {
  return (
    <button
      className={`action-card ${primary ? 'primary' : ''}`}
      disabled={disabled || (loading && !onClick)}
      onClick={onClick}
    >
      <div className="action-icon">
        {loading ? (
          <span className={`spin spin-sm ${primary ? 'spin-primary' : ''}`} />
        ) : (
          icon
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="action-title">{title}</div>
        <div className="action-sub">{subtitle}</div>
        {progress !== undefined && progress > 0 && (
          <div
            style={{
              height: 4,
              borderRadius: 2,
              background: 'rgba(128,128,128,0.25)',
              marginTop: 10,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, progress))}%`,
                background: 'var(--primary)',
                borderRadius: 2,
              }}
            />
          </div>
        )}
      </div>
      <IconChevronRight className="chevron" width={18} height={18} />
    </button>
  );
}
