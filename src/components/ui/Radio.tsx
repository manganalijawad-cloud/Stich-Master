import React, { forwardRef, useId } from 'react';

interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ label, className = '', id: externalId, ...props }, ref) => {
    const generatedId = useId();
    const radioId = externalId || generatedId;

    return (
      <label htmlFor={radioId} className="inline-flex items-center gap-2.5 cursor-pointer select-none group">
        <span className="relative flex items-center justify-center">
          <input
            ref={ref}
            type="radio"
            id={radioId}
            className="peer sr-only"
            {...props}
          />
          <span className="w-4 h-4 rounded-full border-2 border-border bg-surface transition-all duration-150 peer-checked:border-brand-accent group-hover:border-text-muted peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent/30 peer-disabled:opacity-45 peer-disabled:cursor-not-allowed" />
          <span className="absolute w-2 h-2 rounded-full bg-brand-accent scale-0 peer-checked:scale-100 transition-transform duration-150" />
        </span>
        {label && (
          <span className="text-sm font-medium text-text-primary select-none peer-disabled:opacity-45">
            {label}
          </span>
        )}
      </label>
    );
  }
);

Radio.displayName = 'Radio';
