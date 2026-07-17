import React from 'react';

type ChipSize = 'sm' | 'md';

interface ChipProps {
  children: React.ReactNode;
  size?: ChipSize;
  onRemove?: () => void;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

const sizeClasses: Record<ChipSize, string> = {
  sm: 'px-2 py-0.5 text-3xs gap-1',
  md: 'px-2.5 py-1 text-xs gap-1.5',
};

export const Chip = ({ children, size = 'md', selected, onRemove, onClick, className = '' }: ChipProps) => {
  const base = 'inline-flex items-center font-semibold rounded-md border transition-all duration-150 leading-none select-none';

  const stateClasses = selected
    ? 'bg-brand-sky/10 border-brand-sky text-sky-600'
    : onClick
      ? 'bg-surface hover:bg-surface-muted border-border-light text-text-tertiary hover:text-text-secondary cursor-pointer hover:border-border'
      : 'bg-surface-muted border-border-light text-text-tertiary';

  return (
    <span className={`${base} ${stateClasses} ${sizeClasses[size]} ${className}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}>
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="text-current opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
          aria-label="Remove"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      )}
    </span>
  );
};
