import React, { forwardRef, useId } from 'react';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  indeterminate?: boolean;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, indeterminate, error, className = '', id: externalId, ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = externalId || generatedId;

    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={checkboxId} className="inline-flex items-center gap-2.5 cursor-pointer select-none group">
          <span className="relative flex items-center justify-center">
            <input
              ref={ref}
              type="checkbox"
              id={checkboxId}
              className="peer sr-only"
              aria-invalid={!!error}
              {...props}
            />
            <span className="w-4 h-4 rounded border-2 border-border bg-surface transition-all duration-150 peer-checked:border-brand-accent peer-checked:bg-brand-accent group-hover:border-text-muted peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent/30 peer-disabled:opacity-45 peer-disabled:cursor-not-allowed" />
            <svg
              className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity duration-150"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          {label && (
            <span className="text-sm font-medium text-text-primary select-none peer-disabled:opacity-45">
              {label}
            </span>
          )}
        </label>
        {error && (
          <p className="text-xs font-semibold text-danger pl-6" role="alert">{error}</p>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
