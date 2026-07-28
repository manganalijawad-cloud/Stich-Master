import React from 'react';
import { X } from 'lucide-react';
import { DESKTOP_SHORTCUTS } from '../../lib/keyboard';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** In-app cheat sheet — opened with ? when not typing in a field. */
export default function ShortcutsCheatsheet({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="modal-overlay z-[80]"
      onClick={onClose}
    >
      <div
        className="modal-content max-w-lg stack-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 font-display">Keyboard shortcuts</h3>
            <p className="text-3xs text-slate-500 mt-0.5">Designed for fast shop work without the mouse.</p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close">
            <X className="icon-sm" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
          {DESKTOP_SHORTCUTS.map((row) => (
            <div key={row.keys + row.action} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800">{row.action}</p>
                {row.scope ? <p className="text-3xs text-slate-400 uppercase tracking-wider">{row.scope}</p> : null}
              </div>
              <kbd className="shrink-0 text-3xs font-mono font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                {row.keys}
              </kbd>
            </div>
          ))}
        </div>
        <p className="text-3xs text-slate-500">Press Esc to close.</p>
      </div>
    </div>
  );
}
