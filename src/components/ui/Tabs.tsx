import React, { useState } from 'react';

interface TabsProps {
  tabs: { id: string; label: string; badge?: string | number; disabled?: boolean }[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'underline' | 'pills' | 'segmented';
  size?: 'sm' | 'md';
  className?: string;
}

const containerVariant: Record<string, string> = {
  underline: 'border-b border-border-light gap-0',
  pills: 'gap-1',
  segmented: 'bg-surface-muted rounded-xl p-1 gap-0 border border-border-light',
};

const tabVariant = {
  underline: (active: boolean) =>
    active
      ? 'border-b-2 border-brand-sidebar text-text-primary font-semibold -mb-[1px]'
      : 'border-b-2 border-transparent text-text-muted hover:text-text-secondary',
  pills: (active: boolean) =>
    active
      ? 'bg-brand-sidebar text-white shadow-sm'
      : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover',
  segmented: (active: boolean) =>
    active
      ? 'bg-surface text-text-primary shadow-xs font-semibold'
      : 'text-text-muted hover:text-text-secondary',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

export const Tabs = ({ tabs, activeTab, onChange, variant = 'underline', size = 'md', className = '' }: TabsProps) => (
  <div className={`flex items-center ${containerVariant[variant]} ${className}`} role="tablist">
    {tabs.map((tab) => {
      const isActive = tab.id === activeTab;
      return (
        <button
          key={tab.id}
          role="tab"
          aria-selected={isActive}
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium rounded-lg cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 disabled:opacity-45 disabled:cursor-not-allowed ${tabVariant[variant](isActive)} ${sizeClasses[size]} ${variant === 'underline' ? 'rounded-t-lg rounded-b-none' : ''}`}
        >
          {tab.label}
          {tab.badge !== undefined && (
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-3xs font-bold rounded-full bg-current/10 min-w-[1.25rem]">
              {tab.badge}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

interface TabPanelProps {
  id: string;
  activeTab: string;
  children: React.ReactNode;
}

export const TabPanel = ({ id, activeTab, children }: TabPanelProps) => {
  if (id !== activeTab) return null;
  return <div role="tabpanel" aria-labelledby={id}>{children}</div>;
};
