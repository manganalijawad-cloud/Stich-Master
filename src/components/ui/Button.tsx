import React, { forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand-sidebar text-white hover:bg-[#1a2a4a] active:bg-[#0a1525]',
  secondary: 'bg-surface text-text-secondary border border-border hover:bg-surface-muted hover:border-[#cbd5e1] hover:text-text-primary active:bg-surface-hover',
  outline: 'bg-surface text-brand-sidebar border border-border hover:bg-surface-muted hover:border-[#cbd5e1]',
  ghost: 'bg-transparent text-text-secondary border-none hover:bg-surface-hover hover:text-text-primary',
  danger: 'bg-danger text-white hover:bg-[#b91c1c] active:bg-[#991b1b]',
  success: 'bg-positive text-white hover:bg-[#047857] active:bg-[#065f46]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 gap-1 text-xs rounded-md',
  md: 'px-4 py-2 gap-1.5 text-sm rounded-lg',
  lg: 'px-5 py-2.5 gap-2 text-base rounded-lg',
};

const iconOnlySizes: Record<ButtonSize, string> = {
  sm: 'p-1.5',
  md: 'p-2',
  lg: 'p-2.5',
};

const iconSizes: Record<ButtonSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

const Spinner = ({ className }: { className?: string }) => (
  <svg className={`animate-spin ${className || 'w-4 h-4'}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon: Icon, iconRight: IconRight, children, className = '', disabled, ...props }, ref) => {
    const isIconOnly = Icon && !children && !IconRight;
    const paddingClass = isIconOnly ? iconOnlySizes[size] : '';
    const basePadding = isIconOnly ? '' : sizeClasses[size];

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center font-semibold cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 focus-visible:ring-offset-1 disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none select-none ${variantClasses[variant]} ${paddingClass || basePadding} ${className}`}
        {...props}
      >
        {loading ? (
          <Spinner className={iconSizes[size]} />
        ) : Icon ? (
          <Icon className={iconSizes[size]} />
        ) : null}
        {children && <span>{children}</span>}
        {IconRight && !loading && <IconRight className={iconSizes[size]} />}
      </button>
    );
  }
);

Button.displayName = 'Button';
