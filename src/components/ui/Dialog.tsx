import React from 'react';

type DialogSize = 'sm' | 'md' | 'lg';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  size?: DialogSize;
  footer?: React.ReactNode;
}

const sizeClasses: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export const Dialog = ({ open, onClose, title, description, children, size = 'md', footer }: DialogProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(15,23,42,0.55)] backdrop-blur-[6px]" onClick={onClose}>
      <div
        className={`w-full ${sizeClasses[size]} bg-surface rounded-xl shadow-xl animate-scale-up p-6`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {title && (
          <div className="flex items-start justify-between gap-4 mb-2">
            <h2 className="text-lg font-bold text-text-primary font-display">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors cursor-pointer -mr-1 -mt-1"
              aria-label="Close dialog"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        )}
        {description && (
          <p className="text-sm text-text-tertiary mb-4">{description}</p>
        )}
        {children && <div className="text-sm text-text-secondary">{children}</div>}
        {footer && (
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border-light">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export const ConfirmDialog = ({ open, onClose, onConfirm, title = 'Confirm', description = 'Are you sure?', confirmLabel = 'Confirm', confirmVariant = 'primary', danger = false }: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  danger?: boolean;
}) => (
  <Dialog
    open={open}
    onClose={onClose}
    title={title}
    description={description}
    size="sm"
    footer={
      <>
        <button type="button" onClick={onClose} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg cursor-pointer transition-all duration-150 bg-surface text-text-secondary border border-border hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg cursor-pointer transition-all duration-150 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 ${danger || confirmVariant === 'danger' ? 'bg-danger hover:bg-[#b91c1c]' : 'bg-brand-sidebar hover:bg-[#1a2a4a]'}`}
        >
          {confirmLabel}
        </button>
      </>
    }
  />
);

export const AlertDialog = ({ open, onClose, title = 'Alert', message = '' }: {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
}) => (
  <Dialog
    open={open}
    onClose={onClose}
    title={title}
    size="sm"
    footer={
      <button type="button" onClick={onClose} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg cursor-pointer transition-all duration-150 bg-brand-sidebar text-white hover:bg-[#1a2a4a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40">
        OK
      </button>
    }
  >
    <p className="text-sm text-text-secondary">{message}</p>
  </Dialog>
);
