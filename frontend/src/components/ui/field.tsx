import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from './input';
import { Label } from './label';
import { cn } from '@/lib/utils';

interface FieldProps {
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
  autoComplete?: string;
}

export function Field({
  label,
  hint,
  icon,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled,
  className,
  autoFocus,
  autoComplete,
}: FieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && !show ? 'password' : type === 'password' ? 'text' : type;

  return (
    <div className={cn('grid gap-2', className)}>
      {label && <Label>{label}</Label>}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
        )}
        <Input
          type={inputType}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          className={cn(icon && 'pl-9', isPassword && 'pr-10')}
        />
        {isPassword && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
            onClick={() => setShow((s) => !s)}
            tabIndex={-1}
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
