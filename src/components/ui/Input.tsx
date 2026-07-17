import React, { forwardRef, useId } from 'react';
import type { LucideIcon } from 'lucide-react';

type InputSize = 'sm' | 'md' | 'lg';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  size?: InputSize;
  error?: string;
  label?: string | React.ReactNode;
  helperText?: string;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
  onClear?: () => void;
}

const sizeClasses: Record<InputSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs rounded-md',
  md: 'px-3 py-2 text-sm rounded-lg',
  lg: 'px-4 py-2.5 text-base rounded-lg',
};

const iconSizes: Record<InputSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ size = 'md', error, label, helperText, leftIcon: LeftIcon, rightIcon: RightIcon, onClear, className = '', id: externalId, ...props }, ref) => {
    const generatedId = useId();
    const inputId = externalId || generatedId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {LeftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
              <LeftIcon className={iconSizes[size]} />
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full bg-surface border text-text-primary transition-all duration-150 placeholder:text-text-muted focus-visible:outline-none focus-visible:border-brand-accent focus-visible:ring-2 focus-visible:ring-brand-accent/10 disabled:bg-surface-muted disabled:text-text-muted disabled:cursor-not-allowed ${sizeClasses[size]} ${LeftIcon ? 'pl-9' : ''} ${onClear || RightIcon ? 'pr-9' : ''} ${error ? 'border-danger focus-visible:border-danger focus-visible:ring-danger/10' : 'border-border'} ${className}`}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
            {...props}
          />
          {(onClear || RightIcon) && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {RightIcon && <RightIcon className={iconSizes[size]} />}
              {onClear && props.value && (
                <button
                  type="button"
                  onClick={onClear}
                  className="text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                  tabIndex={-1}
                  aria-label="Clear input"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              )}
            </div>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-1 text-xs font-semibold text-danger" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${inputId}-helper`} className="mt-1 text-xs text-text-muted">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
