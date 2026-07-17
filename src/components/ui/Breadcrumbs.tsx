import React from 'react';

interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export const Breadcrumbs = ({ items, className = '' }: BreadcrumbsProps) => (
  <nav className={`flex items-center gap-1.5 text-xs font-semibold ${className}`} aria-label="Breadcrumb">
    {items.map((item, idx) => (
      <React.Fragment key={idx}>
        {idx > 0 && (
          <svg className="w-3.5 h-3.5 text-text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
        )}
        {item.onClick || item.href ? (
          <button
            type="button"
            onClick={item.onClick}
            className="text-text-tertiary hover:text-text-primary transition-colors cursor-pointer border-none bg-transparent"
          >
            {item.label}
          </button>
        ) : (
          <span className="text-text-muted">{item.label}</span>
        )}
      </React.Fragment>
    ))}
  </nav>
);
