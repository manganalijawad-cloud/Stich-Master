import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
  key?: React.Key;
}

export const EmptyState = ({ icon: Icon, title, description, action, className = '' }: EmptyStateProps) => (
  <div className={`flex flex-col items-center justify-center text-center py-16 px-4 ${className}`}>
    {Icon && (
      <div className="w-14 h-14 bg-surface-muted rounded-full flex items-center justify-center text-text-muted mb-4 border border-border shadow-sm">
        <Icon className="w-7 h-7" />
      </div>
    )}
    <h3 className="text-base font-semibold text-text-primary font-display">{title}</h3>
    {description && <p className="text-sm text-text-muted max-w-sm mt-1.5 leading-relaxed">{description}</p>}
    {action && (
      <Button variant="primary" size="sm" className="mt-5" onClick={action.onClick}>{action.label}</Button>
    )}
  </div>
);
