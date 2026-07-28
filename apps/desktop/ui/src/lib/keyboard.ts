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

/** Simple keys only — shop staff should use buttons; these are optional helpers. */
export const DESKTOP_SHORTCUTS: Array<{ keys: string; action: string; scope?: string }> = [
  { keys: 'Esc', action: 'Cancel, go back, or close a dialog', scope: 'Anywhere' },
  { keys: 'Enter', action: 'Confirm the highlighted item or dialog', scope: 'Lists & dialogs' },
  { keys: '↑ ↓', action: 'Move through a list', scope: 'Lists' },
  { keys: '/', action: 'Jump to search', scope: 'Orders & Customers' },
];
