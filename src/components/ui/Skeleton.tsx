import React from 'react';

type SkeletonVariant = 'text' | 'card' | 'row' | 'avatar' | 'badge';

interface SkeletonProps {
  variant?: SkeletonVariant;
  className?: string;
  width?: string;
  height?: string;
  key?: React.Key;
  children?: never;
}

const variantClasses: Record<SkeletonVariant, string> = {
  text: 'h-4 rounded',
  card: 'h-32 rounded-xl',
  row: 'h-12 rounded-lg',
  avatar: 'h-10 w-10 rounded-full',
  badge: 'h-5 w-16 rounded-full',
};

export const Skeleton = ({ variant = 'text', className = '', width, height }: SkeletonProps) => (
  <div
    className={`bg-gradient-to-r from-surface-muted via-surface-hover to-surface-muted bg-[length:200%_100%] animate-shimmer ${variantClasses[variant]} ${className}`}
    style={{ width, height }}
    aria-hidden="true"
  />
);

export const TableSkeleton = ({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) => (
  <div className="space-y-1">
    <div className="flex gap-4 p-3">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} variant="text" className="flex-1" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex gap-4 p-3 border-t border-border-light">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} variant="text" className={`flex-1 ${c === cols - 1 ? 'w-20 flex-none' : ''}`} />
        ))}
      </div>
    ))}
  </div>
);

export const CardSkeleton = ({ count = 3 }: { count?: number }) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="card p-4 space-y-3">
        <Skeleton variant="badge" />
        <Skeleton variant="text" className="h-8 w-3/4" />
        <Skeleton variant="text" className="w-1/2" />
      </div>
    ))}
  </div>
);

export const ListSkeleton = ({ count = 4 }: { count?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 p-3 bg-surface border border-border-light rounded-xl">
        <Skeleton variant="avatar" className="shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton variant="text" className="w-1/3" />
          <Skeleton variant="text" className="w-1/2" />
        </div>
        <Skeleton variant="badge" />
      </div>
    ))}
  </div>
);
