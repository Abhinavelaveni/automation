import { useEffect, useRef, useState } from 'react';
import { IconChevronDown, IconClose } from './Icons';

// ── Button ────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'link';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children?: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} btn-${size} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className={`spin spin-sm ${variant === 'primary' ? 'spin-primary' : ''}`} />}
      {children}
    </button>
  );
}

// ── TextField ─────────────────────────────────────────────────
interface TextFieldProps {
  label?: string;
  hint?: string;
  icon?: React.ReactNode;
  type?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export function TextField({
  label,
  hint,
  icon,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled,
  className = '',
  autoFocus,
}: TextFieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && !show ? 'password' : type === 'password' ? 'text' : type;

  return (
    <div className={`field ${className}`}>
      {label && <span className="field-label">{label}</span>}
      <div className="input-wrap">
        {icon && <span className="input-icon">{icon}</span>}
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
        />
        {isPassword && (
          <button
            type="button"
            className="input-toggle"
            onClick={() => setShow((s) => !s)}
            tabIndex={-1}
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? (
              <IconEyeOff />
            ) : (
              <IconEye />
            )}
          </button>
        )}
      </div>
      {hint && <span className="tx-xsmall tx-muted">{hint}</span>}
    </div>
  );
}

export function IconEye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

// ── Select ────────────────────────────────────────────────────
interface SelectProps<T> {
  value: T | null;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  placeholder?: string;
  className?: string;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`select ${className}`} ref={ref}>
      <button
        type="button"
        className="select-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        {selected ? (
          <span>{selected.label}</span>
        ) : (
          <span className="select-placeholder">{placeholder}</span>
        )}
        <IconChevronDown width={16} height={16} />
      </button>
      {open && (
        <div className="select-menu">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`select-option ${o.value === value ? 'active' : ''}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────
export function Card({
  children,
  className = '',
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`card ${className}`} style={style}>
      {children}
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────
export function Divider() {
  return <hr className="divider" />;
}

// ── Spinner ───────────────────────────────────────────────────
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return <span className={`spin ${size === 'sm' ? 'spin-sm' : ''}`} />;
}

// ── Dialog ────────────────────────────────────────────────────
interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
  sheet?: boolean;
}

export function Dialog({ open, onClose, children, maxWidth = 440, sheet = false }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`overlay ${sheet ? 'overlay-sheet' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={sheet ? 'sheet' : 'modal'} style={{ maxWidth }}>
        {sheet && <div className="sheet-handle" />}
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  title,
  icon,
  onClose,
  muted,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  onClose?: () => void;
  muted?: React.ReactNode;
}) {
  return (
    <div className="row-between" style={{ padding: '24px 24px 0' }}>
      <div className="row gap-8" style={{ minWidth: 0 }}>
        {icon}
        <div style={{ minWidth: 0 }}>
          <div className="tx-large tx-semi">{title}</div>
          {muted}
        </div>
      </div>
      {onClose && (
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <IconClose />
        </button>
      )}
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────
export function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-title">{title}</div>
      </div>
    </div>
  );
}
