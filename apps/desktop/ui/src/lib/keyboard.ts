/**
 * Shared keyboard helpers for desktop-style navigation.
 */

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

export function isMod(e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'>): boolean {
  return e.metaKey || e.ctrlKey;
}

export function focusElement(el: HTMLElement | null | undefined): void {
  if (!el) return;
  requestAnimationFrame(() => {
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const len = el.value?.length ?? 0;
      try {
        el.setSelectionRange(len, len);
      } catch {
        /* number/date inputs may not support selection */
      }
    }
  });
}

export type HotkeyHandler = (e: KeyboardEvent) => boolean | void;

/**
 * Run handlers in order; stop when a handler returns true.
 */
export function matchHotkeys(e: KeyboardEvent, handlers: HotkeyHandler[]): void {
  for (const handler of handlers) {
    if (handler(e) === true) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }
}

/** Common chord labels for the in-app cheat sheet. */
export const DESKTOP_SHORTCUTS: Array<{ keys: string; action: string; scope?: string }> = [
  { keys: 'Ctrl+1…4', action: 'Switch Customers / Orders / Finances / Settings', scope: 'App' },
  { keys: 'Ctrl+N', action: 'New order or customer', scope: 'Page' },
  { keys: 'Ctrl+F / /', action: 'Focus search', scope: 'Page' },
  { keys: '↑ ↓', action: 'Move through list / search results', scope: 'Page' },
  { keys: 'Enter', action: 'Open selected / confirm primary action', scope: 'Page' },
  { keys: 'Esc', action: 'Cancel, close dialog, or go back', scope: 'Global' },
  { keys: 'Ctrl+Enter', action: 'Next step / lock order / save', scope: 'Forms' },
  { keys: 'Ctrl+S', action: 'Save edits', scope: 'Orders' },
  { keys: 'Ctrl+P', action: 'Print', scope: 'Orders' },
  { keys: 'F2', action: 'Edit selected order', scope: 'Orders' },
  { keys: 'Ctrl+Shift+→', action: 'Advance order status', scope: 'Orders' },
  { keys: 'Delete', action: 'Delete (Owner, with confirm)', scope: 'Orders' },
  { keys: '?', action: 'Show this shortcut list', scope: 'Global' },
];
