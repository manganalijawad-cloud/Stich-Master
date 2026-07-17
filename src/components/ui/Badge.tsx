import React from 'react';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'gray' | 'purple';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-surface-muted text-text-tertiary border border-border-light',
  primary: 'bg-info-bg text-[#1D4ED8]',
  success: 'bg-positive-bg text-[#15803D]',
  warning: 'bg-warning-bg text-[#92400E]',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-[#1D4ED8]',
  gray: 'bg-surface-muted text-text-tertiary',
  purple: 'bg-[#F3E8FF] text-[#9333EA]',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-3xs',
  md: 'px-2 py-1 text-3xs',
};

export const Badge = ({ variant = 'default', size = 'sm', children, className = '' }: BadgeProps) => (
  <span className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider rounded-full leading-none ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}>
    {children}
  </span>
);
