import React, { forwardRef, useId } from 'react';

type TextareaSize = 'sm' | 'md' | 'lg';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: TextareaSize;
  error?: string;
  label?: string;
  helperText?: string;
}

const sizeClasses: Record<TextareaSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs rounded-md min-h-[4rem]',
  md: 'px-3 py-2 text-sm rounded-lg min-h-[5rem]',
  lg: 'px-4 py-2.5 text-base rounded-lg min-h-[6rem]',
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ size = 'md', error, label, helperText, className = '', id: externalId, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = externalId || generatedId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`w-full bg-surface border text-text-primary transition-all duration-150 placeholder:text-text-muted focus-visible:outline-none focus-visible:border-brand-accent focus-visible:ring-2 focus-visible:ring-brand-accent/10 disabled:bg-surface-muted disabled:text-text-muted disabled:cursor-not-allowed resize-y ${sizeClasses[size]} ${error ? 'border-danger focus-visible:border-danger focus-visible:ring-danger/10' : 'border-border'} ${className}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
          {...props}
        />
        {error && (
          <p id={`${textareaId}-error`} className="mt-1 text-xs font-semibold text-danger" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${textareaId}-helper`} className="mt-1 text-xs text-text-muted">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
