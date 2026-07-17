import React, { useState, useRef, useEffect } from 'react';

export interface DropdownItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: 'start' | 'end';
}

export const DropdownMenu = ({ trigger, items, align = 'end' }: DropdownMenuProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <div
          className={`absolute z-50 mt-1 min-w-[180px] bg-surface rounded-xl shadow-lg border border-border-light py-1 animate-scale-up ${align === 'end' ? 'right-0' : 'left-0'}`}
          role="menu"
        >
          {items.map((item, idx) => (
            <React.Fragment key={idx}>
              {item.divider && <div className="my-1 border-t border-border-light" />}
              <button
                type="button"
                disabled={item.disabled}
                onClick={() => { item.onClick(); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors cursor-pointer border-none text-left ${item.danger ? 'text-danger hover:bg-danger-bg' : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'} disabled:opacity-40 disabled:cursor-not-allowed`}
                role="menuitem"
              >
                {item.icon && <span className="w-4 h-4 shrink-0">{item.icon}</span>}
                {item.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};
