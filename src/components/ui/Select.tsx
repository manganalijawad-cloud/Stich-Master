import React, { forwardRef, useId } from 'react';

type SelectSize = 'sm' | 'md' | 'lg';

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  size?: SelectSize;
  error?: string;
  label?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
}

const sizeClasses: Record<SelectSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs rounded-md',
  md: 'px-3 py-2 text-sm rounded-lg',
  lg: 'px-4 py-2.5 text-base rounded-lg',
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ size = 'md', error, label, helperText, options, placeholder, className = '', id: externalId, value, ...props }, ref) => {
    const generatedId = useId();
    const selectId = externalId || generatedId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            value={value}
            className={`w-full appearance-none bg-surface border text-text-primary cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:border-brand-accent focus-visible:ring-2 focus-visible:ring-brand-accent/10 disabled:bg-surface-muted disabled:text-text-muted disabled:cursor-not-allowed pr-8 ${sizeClasses[size]} ${error ? 'border-danger focus-visible:border-danger focus-visible:ring-danger/10' : 'border-border'} ${className}`}
            aria-invalid={!!error}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-text-muted">
            <svg className={`${size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
          </div>
        </div>
        {error && (
          <p className="mt-1 text-xs font-semibold text-danger" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="mt-1 text-xs text-text-muted">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
